// Minimal, dependency-free XLSX reader/writer for CODE QUEST.
// Reads the OOXML (ZIP + XML) produced by Excel/openpyxl and builds the same
// format for exports.  Only the features we need are implemented:
//   - shared strings, inline strings, cached formula values
//   - first row as header, blank rows skipped
//   - writing inline-string worksheets
import zlib from 'node:zlib';

// ------------------------------------------------------------------ helpers
function decodeXml(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function escapeXml(s) {
  return String(s ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = decodeXml(m[2]);
  return out;
}

function colIndex(ref) {
  const letters = (ref.match(/^[A-Z]+/i) || ['A'])[0].toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function colLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// ------------------------------------------------------------------ ZIP read
function readZip(buf) {
  let eocd = -1;
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ليس ملف XLSX صالحًا (ZIP end record غير موجود)');
  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('تلف في فهرس ZIP');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (compSize === 0xffffffff || uncompSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error('ملفات ZIP64 غير مدعومة');
    }
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('تلف في رأس ZIP المحلي');
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error('طريقة ضغط غير مدعومة: ' + method);
    files.set(name.replace(/\\/g, '/'), data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// ------------------------------------------------------------------ XLSX read
function readSharedStrings(zip) {
  const entry = zip.get('xl/sharedStrings.xml');
  if (!entry) return [];
  const xml = entry.toString('utf8');
  const out = [];
  for (const m of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const body = m[1];
    let text = '';
    for (const t of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) text += decodeXml(t[1]);
    out.push(text);
  }
  return out;
}

function readWorkbook(zip) {
  const wbEntry = zip.get('xl/workbook.xml');
  if (!wbEntry) throw new Error('ملف workbook.xml غير موجود');
  const wb = wbEntry.toString('utf8');
  const relsEntry = zip.get('xl/_rels/workbook.xml.rels');
  const rels = relsEntry ? relsEntry.toString('utf8') : '';
  const relMap = new Map();
  for (const m of rels.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const a = attrs(m[0]);
    if (a.Id && a.Target) relMap.set(a.Id, a.Target);
  }
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const a = attrs(m[0]);
    let target = relMap.get(a['r:id']) || '';
    if (target.startsWith('/')) target = target.slice(1);
    else if (!target.startsWith('xl/')) target = 'xl/' + target;
    sheets.push({ name: a.name, path: target });
  }
  return sheets;
}

function cellValue(body, type, shared) {
  if (type === 'inlineStr') {
    let text = '';
    for (const t of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) text += decodeXml(t[1]);
    return text;
  }
  const v = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
  if (!v) return '';
  const raw = decodeXml(v[1]);
  if (type === 's') return shared[Number(raw)] ?? '';
  if (type === 'b') return raw === '1' ? 'TRUE' : 'FALSE';
  return raw;
}

function readSheet(xml, shared) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = attrs('<c ' + cellMatch[1] + '>');
      const idx = colIndex(a.r || 'A1');
      cells[idx] = cellValue(cellMatch[2] || '', a.t || '', shared).trim();
    }
    if (cells.some(v => v !== undefined && String(v).trim() !== '')) {
      rows.push(Array.from(cells, v => (v === undefined ? '' : v)));
    }
  }
  return rows;
}

/**
 * Parse an XLSX buffer into { sheetName: [{header: value}, ...] }.
 * First non-empty row of every sheet is treated as the header.
 */
export function parseXlsx(buf) {
  const zip = readZip(buf);
  const shared = readSharedStrings(zip);
  const sheets = readWorkbook(zip);
  const result = {};
  for (const sheet of sheets) {
    const entry = zip.get(sheet.path);
    if (!entry) continue;
    const raw = readSheet(entry.toString('utf8'), shared);
    if (!raw.length) { result[sheet.name] = []; continue; }
    const header = raw[0].map((h, i) => String(h || '').trim() || `column_${i + 1}`);
    const rows = [];
    for (let r = 1; r < raw.length; r++) {
      const obj = {};
      for (let c = 0; c < header.length; c++) obj[header[c]] = raw[r][c] ?? '';
      if (Object.values(obj).some(v => String(v).trim() !== '')) rows.push(obj);
    }
    result[sheet.name] = rows;
  }
  return result;
}

// ------------------------------------------------------------------ XLSX write
function sheetXml(rows) {
  const parts = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<sheetData>',
  ];
  rows.forEach((row, r) => {
    const cells = [];
    row.forEach((value, c) => {
      if (value === null || value === undefined || value === '') return;
      const ref = colLetter(c) + (r + 1);
      const text = String(value);
      cells.push(
        `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`
      );
    });
    if (cells.length) parts.push(`<row r="${r + 1}">${cells.join('')}</row>`);
  });
  parts.push('</sheetData></worksheet>');
  return parts.join('');
}

function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ 0xffffffff) >>> 0;
}
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function zipFiles(files) {
  const local = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
  for (const [name, data] of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const comp = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(dosTime, 10);
    lh.writeUInt16LE(dosDate, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    local.push(lh, nameBuf, comp);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(dosTime, 12);
    cd.writeUInt16LE(dosDate, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += lh.length + nameBuf.length + comp.length;
  }
  const centralBuf = Buffer.concat(central);
  const localBuf = Buffer.concat(local);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localBuf, centralBuf, eocd]);
}

/**
 * Build a valid XLSX buffer from [{name, rows: [[...], [...]]}].
 */
export function buildXlsx(sheets) {
  const files = [];
  const sheetEntries = sheets.map((s, i) => {
    const path = `xl/worksheets/sheet${i + 1}.xml`;
    files.push([path, Buffer.from(sheetXml(s.rows), 'utf8')]);
    return { name: s.name, path: `/xl/worksheets/sheet${i + 1}.xml`, id: i + 1 };
  });
  const contentTypes = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    ...sheetEntries.map(s =>
      `<Override PartName="${s.path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    ),
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    '</Types>',
  ].join('');
  const rootRels = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    '</Relationships>',
  ].join('');
  const workbook = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<sheets>',
    ...sheetEntries.map((s, i) => `<sheet name="${escapeXml(s.name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`),
    '</sheets>',
    '</workbook>',
  ].join('');
  const workbookRels = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    ...sheetEntries.map((s, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    ),
    `<Relationship Id="rId${sheetEntries.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    '</Relationships>',
  ].join('');
  const styles = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>',
    '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>',
    '<borders count="1"><border/></borders>',
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>',
    '</styleSheet>',
  ].join('');
  files.unshift(
    ['[Content_Types].xml', Buffer.from(contentTypes, 'utf8')],
    ['_rels/.rels', Buffer.from(rootRels, 'utf8')],
    ['xl/workbook.xml', Buffer.from(workbook, 'utf8')],
    ['xl/_rels/workbook.xml.rels', Buffer.from(workbookRels, 'utf8')],
    ['xl/styles.xml', Buffer.from(styles, 'utf8')]
  );
  return zipFiles(files);
}
