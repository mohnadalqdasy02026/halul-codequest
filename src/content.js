// CODE QUEST — curated content: worlds, ranks, achievements, bosses, shop.
// Terms and meanings are imported from the Excel source; this file only holds
// game structure and hand-authored educational code snippets.

export const WORLDS = [
  {
    code: 'W01', name_en: 'Programming Fundamentals', name_ar: 'أساسيات البرمجة',
    subtitle_ar: 'ابدأ من الصفر وافهم لغة المبرمجين',
    description_ar: 'المتغيرات والثوابت وأنواع البيانات والتعليمات — الأساس الذي تُبنى عليه كل لغة برمجة.',
    color: '#258BFF', icon: '⌨️',
    categories: ['أساسيات البرمجة', 'مفاهيم البرمجة العامة'],
  },
  {
    code: 'W02', name_en: 'Programming Languages', name_ar: 'لغات البرمجة',
    subtitle_ar: 'اختر لغتك وافهم أنماط البرمجة',
    description_ar: 'لغات البرمجة الشائعة، والبرمجة الإجرائية والوظيفية، ومتى تستخدم كل لغة.',
    color: '#00D9FF', icon: '🌐',
    categories: ['لغات البرمجة', 'البرمجة الإجرائية', 'البرمجة الوظيفية'],
  },
  {
    code: 'W03', name_en: 'Object-Oriented Programming', name_ar: 'البرمجة كائنية التوجه',
    subtitle_ar: 'فكّر بالكائنات والأصناف',
    description_ar: 'الأصناف والكائنات والوراثة وتعدد الأشكال — طريقة تفكير كاملة في تصميم البرمجيات.',
    color: '#A855F7', icon: '🧩',
    categories: ['البرمجة كائنية التوجه'],
  },
  {
    code: 'W04', name_en: 'Data Structures & Algorithms', name_ar: 'هياكل البيانات والخوارزميات',
    subtitle_ar: 'رتّب البيانات وحلّ المشكلات بكفاءة',
    description_ar: 'المصفوفات والقوائم والأشجار والجداول، مع الخوارزميات وتحليل التعقيد.',
    color: '#22C55E', icon: '🧮',
    categories: ['هياكل البيانات', 'الخوارزميات'],
  },
  {
    code: 'W05', name_en: 'Web Development', name_ar: 'تطوير الويب',
    subtitle_ar: 'ابنِ الويب من الواجهة إلى الـ API',
    description_ar: 'الواجهة الأمامية والخلفية وواجهات برمجة التطبيقات وخدمات الويب وتقنيات HTML وCSS وJavaScript.',
    color: '#258BFF', icon: '🕸️',
    categories: [
      'تطوير الويب - الواجهة الأمامية', 'تطوير الويب - الواجهة الخلفية',
      'واجهات برمجة التطبيقات', 'خدمات الويب',
      'تصميم واجهات الويب', 'تقنيات HTML وCSS وJavaScript',
    ],
  },
  {
    code: 'W06', name_en: 'Mobile Development', name_ar: 'تطوير تطبيقات الهاتف',
    subtitle_ar: 'تطبيقات في جيب كل مستخدم',
    description_ar: 'مصطلحات Android وiOS والحزم والإصدارات وتجربة المستخدم على الهاتف.',
    color: '#F5B942', icon: '📱',
    categories: ['تطوير تطبيقات الهاتف'],
  },
  {
    code: 'W07', name_en: 'Database Engineering', name_ar: 'هندسة قواعد البيانات',
    subtitle_ar: 'خزّن البيانات واسترجعها باحتراف',
    description_ar: 'قواعد البيانات العلائقية وغير العلائقية ولغة SQL والجداول والمفاتيح والفهارس.',
    color: '#00D9FF', icon: '🗄️',
    categories: ['قواعد البيانات', 'لغة SQL', 'قواعد البيانات العلائقية', 'قواعد البيانات غير العلائقية'],
  },
  {
    code: 'W08', name_en: 'Networking', name_ar: 'الشبكات',
    subtitle_ar: 'اعرف كيف تتحدث الأجهزة',
    description_ar: 'الشبكات وبروتوكولات الاتصال وعناوين IP وTCP/UDP وDNS.',
    color: '#22C55E', icon: '📡',
    categories: ['الشبكات', 'بروتوكولات الاتصال'],
  },
  {
    code: 'W09', name_en: 'Cybersecurity', name_ar: 'الأمن السيبراني',
    subtitle_ar: 'احمِ الأنظمة والبيانات',
    description_ar: 'التحقق من الهوية والتفويض والتشفير والتجزئة والثغرات والهجمات الشائعة.',
    color: '#EF4444', icon: '🛡️',
    categories: ['الأمن السيبراني', 'أمن المعلومات'],
  },
  {
    code: 'W10', name_en: 'Operating Systems', name_ar: 'أنظمة التشغيل',
    subtitle_ar: 'افهم ما يدير جهازك',
    description_ar: 'النواة وإدارة الذاكرة والعمليات والخيوط والمعالجة المتوازية وهندسة الحاسوب.',
    color: '#A855F7', icon: '🖥️',
    categories: ['أنظمة التشغيل', 'الحوسبة المتوازية', 'هندسة الحاسوب'],
  },
  {
    code: 'W11', name_en: 'Software Engineering', name_ar: 'هندسة البرمجيات',
    subtitle_ar: 'ابنِ برمجيات منظمة وقابلة للصيانة',
    description_ar: 'دورة حياة البرمجيات والتحليل والتصميم وUML والاختبار والجودة والتحكم بالإصدارات وDevOps.',
    color: '#F5B942', icon: '⚙️',
    categories: [
      'هندسة البرمجيات', 'تحليل وتصميم الأنظمة', 'UML ومخططات النمذجة',
      'اختبار البرمجيات', 'ضمان الجودة', 'التحكم بالإصدارات',
      'Git وGitHub', 'DevOps', 'أدوات المطورين',
    ],
  },
  {
    code: 'W12', name_en: 'Artificial Intelligence', name_ar: 'الذكاء الاصطناعي',
    subtitle_ar: 'علّم الآلة أن تفهم وتنتج',
    description_ar: 'الذكاء الاصطناعي ومعالجة اللغات الطبيعية والذكاء التوليدي والنماذج اللغوية.',
    color: '#00D9FF', icon: '🤖',
    categories: ['الذكاء الاصطناعي', 'معالجة اللغات الطبيعية', 'الذكاء الاصطناعي التوليدي'],
  },
  {
    code: 'W13', name_en: 'Machine Learning', name_ar: 'تعلم الآلة',
    subtitle_ar: 'من البيانات إلى التنبؤ',
    description_ar: 'التعلم العميق والشبكات العصبية والتدريب والميزات والإفراط في التخصيص.',
    color: '#22C55E', icon: '🧠',
    categories: ['تعلم الآلة', 'التعلم العميق'],
  },
  {
    code: 'W14', name_en: 'Data Science', name_ar: 'علوم البيانات',
    subtitle_ar: 'حوّل البيانات إلى قرارات',
    description_ar: 'علوم البيانات وتحليلها والتصور والتنقيب عن البيانات ومقاييس الأعمال.',
    color: '#F5B942', icon: '📊',
    categories: ['علوم البيانات', 'تحليل البيانات'],
  },
  {
    code: 'W15', name_en: 'Advanced Computer Science', name_ar: 'علوم الحاسوب المتقدمة',
    subtitle_ar: 'آفاق التقنية الحديثة',
    description_ar: 'الحوسبة السحابية وإنترنت الأشياء والروبوتات وأطر العمل والمكتبات وتصميم الواجهات.',
    color: '#A855F7', icon: '🚀',
    categories: [
      'الحوسبة السحابية', 'إنترنت الأشياء', 'الروبوتات',
      'أطر العمل', 'المكتبات البرمجية', 'تصميم الواجهات وتجربة المستخدم',
      'مصطلحات تقنية وحاسوبية عامة', 'تطوير تطبيقات سطح المكتب',
    ],
  },
];

export const MAX_LEVEL = 40;

/** Cumulative XP required to reach a level. */
export function xpForLevel(level) {
  if (level <= 1) return 0;
  const n = Math.min(level, MAX_LEVEL);
  return Math.round(50 * (n - 1) * n);
}

export const RANKS = [
  { key: 'beginner',  name_en: 'Beginner Programmer', name_ar: 'مبرمج مبتدئ',   minLevel: 1,  color: '#94A3B8', icon: '🌱' },
  { key: 'junior',    name_en: 'Junior Coder',        name_ar: 'مبرمج ناشئ',    minLevel: 5,  color: '#22C55E', icon: '🌿' },
  { key: 'explorer',  name_en: 'Code Explorer',       name_ar: 'مستكشف الشيفرة', minLevel: 9,  color: '#00D9FF', icon: '🧭' },
  { key: 'developer', name_en: 'Developer',           name_ar: 'مطوّر',          minLevel: 13, color: '#258BFF', icon: '💻' },
  { key: 'senior',    name_en: 'Senior Developer',    name_ar: 'مطوّر أول',      minLevel: 17, color: '#6366F1', icon: '⚡' },
  { key: 'engineer',  name_en: 'Software Engineer',   name_ar: 'مهندس برمجيات', minLevel: 21, color: '#A855F7', icon: '🛠️' },
  { key: 'architect', name_en: 'Code Architect',      name_ar: 'معماري الشيفرة', minLevel: 26, color: '#F5B942', icon: '🏛️' },
  { key: 'master',    name_en: 'Master Programmer',   name_ar: 'مبرمج محترف',    minLevel: 31, color: '#F97316', icon: '🔥' },
  { key: 'legendary', name_en: 'Legendary Developer', name_ar: 'مطوّر أسطوري',  minLevel: 36, color: '#F43F5E', icon: '👑' },
];

export function levelFromXp(xp) {
  let level = 1;
  for (let l = 2; l <= MAX_LEVEL; l++) {
    if (xp >= xpForLevel(l)) level = l;
    else break;
  }
  return level;
}

export function rankForLevel(level) {
  let rank = RANKS[0];
  for (const r of RANKS) if (level >= r.minLevel) rank = r;
  return rank;
}

export const ACHIEVEMENTS = [
  { code: 'first_word', title_ar: 'أول كلمة', title_en: 'First Word', description_ar: 'تعلّم أول مصطلح في اللعبة.', icon: '🌱', tier: 'bronze', xp: 25, coins: 5, condition: { type: 'terms_seen', value: 1 }, sort: 1 },
  { code: 'word_hunter', title_ar: 'صائد الكلمات', title_en: 'Word Hunter', description_ar: 'شاهد 50 مصطلحًا مختلفًا.', icon: '🎯', tier: 'silver', xp: 100, coins: 25, condition: { type: 'terms_seen', value: 50 }, sort: 2 },
  { code: 'vocabulary_master', title_ar: 'سيد المفردات', title_en: 'Vocabulary Master', description_ar: 'أتقن 100 مصطلح.', icon: '📚', tier: 'gold', xp: 250, coins: 60, condition: { type: 'terms_mastered', value: 100 }, sort: 3 },
  { code: 'perfect_round', title_ar: 'جولة كاملة', title_en: 'Perfect Round', description_ar: 'أكمل جولة بكل إجابة صحيحة.', icon: '💯', tier: 'silver', xp: 80, coins: 20, condition: { type: 'perfect_round', value: 1 }, sort: 4 },
  { code: 'speed_coder', title_ar: 'مبرمج سريع', title_en: 'Speed Coder', description_ar: 'أكمل تحدي السرعة بنجاح.', icon: '⏱️', tier: 'silver', xp: 120, coins: 30, condition: { type: 'mode_completed', mode: 'speed' }, sort: 5 },
  { code: 'seven_day_streak', title_ar: 'سبعة أيام متتالية', title_en: 'Seven Day Streak', description_ar: 'تعلّم سبعة أيام متتالية.', icon: '🔥', tier: 'gold', xp: 200, coins: 50, condition: { type: 'streak', value: 7 }, sort: 6 },
  { code: 'db_explorer', title_ar: 'مستكشف قواعد البيانات', title_en: 'Database Explorer', description_ar: 'أكمل عالم هندسة قواعد البيانات.', icon: '🗄️', tier: 'gold', xp: 300, coins: 70, condition: { type: 'world_completed', world: 'W07' }, sort: 7 },
  { code: 'cyber_guardian', title_ar: 'حارس الفضاء السيبراني', title_en: 'Cyber Guardian', description_ar: 'أكمل عالم الأمن السيبراني.', icon: '🛡️', tier: 'gold', xp: 300, coins: 70, condition: { type: 'world_completed', world: 'W09' }, sort: 8 },
  { code: 'boss_slayer', title_ar: 'قاتل الزعماء', title_en: 'Boss Slayer', description_ar: 'اهزم ثلاثة زعماء تقنيين.', icon: '⚔️', tier: 'gold', xp: 350, coins: 90, condition: { type: 'bosses_defeated', value: 3 }, sort: 9 },
  { code: 'code_architect', title_ar: 'معماري الشيفرة', title_en: 'Code Architect', description_ar: 'اصل إلى المستوى 26.', icon: '🏛️', tier: 'platinum', xp: 500, coins: 120, condition: { type: 'level', value: 26 }, sort: 10 },
  { code: 'polyglot', title_ar: 'متعدد المعارف', title_en: 'Knowledge Polyglot', description_ar: 'شاهد 200 مصطلح مختلف.', icon: '🌍', tier: 'platinum', xp: 400, coins: 100, condition: { type: 'terms_seen', value: 200 }, sort: 11 },
  { code: 'legendary_learner', title_ar: 'متعلّم أسطوري', title_en: 'Legendary Learner', description_ar: 'أتقن 500 مصطلح.', icon: '👑', tier: 'platinum', xp: 1000, coins: 250, condition: { type: 'terms_mastered', value: 500 }, sort: 12 },
];

export const BOSSES = [
  { code: 'boss-db', name_en: 'The Data Overlord', name_ar: 'سيّد البيانات', categories: ['قواعد البيانات', 'لغة SQL', 'قواعد البيانات العلائقية', 'قواعد البيانات غير العلائقية'], icon: '🗄️', color: '#00D9FF', requiredLevel: 6, xp: 300, coins: 90, title_ar: 'زعيم قواعد البيانات', description_ar: 'أسئلة متدرجة في الجداول والمفاتيح والاستعلامات. أجب صحيحًا لتسقط دروعه.' , sort: 1 },
  { code: 'boss-net', name_en: 'Packet Phantom', name_ar: 'شبح الحزم', categories: ['الشبكات', 'بروتوكولات الاتصال'], icon: '📡', color: '#22C55E', requiredLevel: 9, xp: 300, coins: 90, title_ar: 'زعيم الشبكات', description_ar: 'اختبر معرفتك بالبروتوكولات والعناوين وطبقات الشبكة.', sort: 2 },
  { code: 'boss-sec', name_en: 'Cipher Warden', name_ar: 'حارس التشفير', categories: ['الأمن السيبراني', 'أمن المعلومات'], icon: '🛡️', color: '#EF4444', requiredLevel: 12, xp: 350, coins: 100, title_ar: 'زعيم الأمن السيبراني', description_ar: 'التحقق والتفويض والتشفير والثغرات — لا مجال للخطأ.', sort: 3 },
  { code: 'boss-prog', name_en: 'Syntax Titan', name_ar: 'عملاق الصياغة', categories: ['أساسيات البرمجة', 'مفاهيم البرمجة العامة', 'لغات البرمجة'], icon: '⌨️', color: '#258BFF', requiredLevel: 4, xp: 250, coins: 75, title_ar: 'زعيم البرمجة', description_ar: 'معركة على المتغيرات والدوال والأنماط الأساسية.', sort: 4 },
  { code: 'boss-ai', name_en: 'Neural Nemesis', name_ar: 'خصم الشبكات العصبية', categories: ['الذكاء الاصطناعي', 'تعلم الآلة', 'التعلم العميق', 'معالجة اللغات الطبيعية', 'الذكاء الاصطناعي التوليدي'], icon: '🤖', color: '#A855F7', requiredLevel: 15, xp: 400, coins: 120, title_ar: 'زعيم الذكاء الاصطناعي', description_ar: 'النماذج والتدريب والميزات والتحويلات — أثبت فهمك.', sort: 5 },
  { code: 'boss-se', name_en: 'Legacy Keeper', name_ar: 'حافظ الإرث', categories: ['هندسة البرمجيات', 'تحليل وتصميم الأنظمة', 'اختبار البرمجيات', 'ضمان الجودة', 'UML ومخططات النمذجة'], icon: '⚙️', color: '#F5B942', requiredLevel: 10, xp: 350, coins: 100, title_ar: 'زعيم هندسة البرمجيات', description_ar: 'دورة الحياة والمتطلبات والاختبار والجودة.', sort: 6 },
];

// Hand-authored educational snippets for the Complete the Code mode.
// Keys must match English_Term exactly; unmatched entries are skipped at seed time.
export const CODE_BANK = [
  { term: 'Variable', code: 'x = 10  # x is a ______ that stores the value 10', syntax: 'python', note_ar: 'المتغير يخزّن قيمة يمكن تغييرها.' },
  { term: 'Constant', code: 'MAX_SIZE = 100  # MAX_SIZE is a ______ ; it should not change', syntax: 'python', note_ar: 'الثابت لا يُفترض تغييره أثناء التشغيل.' },
  { term: 'Integer', code: 'count = 12  # 12 is an ______ value', syntax: 'python', note_ar: 'العدد الصحيح بلا جزء عشري.' },
  { term: 'Float', code: 'price = 9.99  # 9.99 is a ______ value', syntax: 'python', note_ar: 'العدد العشري يحمل كسرًا.' },
  { term: 'String', code: 'name = "Ali"  # "Ali" is a ______', syntax: 'python', note_ar: 'السلسلة النصية تُحاط بعلامات اقتباس.' },
  { term: 'Boolean', code: 'is_active = True  # True is a ______ value', syntax: 'python', note_ar: 'القيمة المنطقية إما True أو False.' },
  { term: 'Array', code: 'numbers = [2, 4, 6]  # numbers is an ______ of integers', syntax: 'javascript', note_ar: 'المصفوفة تجمع عناصر مرتبة بالفهرس.' },
  { term: 'Function', code: 'def add(a, b):\n    return a + b  # add is a ______', syntax: 'python', note_ar: 'الدالة تستقبل مدخلات وتعيد نتيجة.' },
  { term: 'Class', code: 'class User:\n    pass  # User is a ______', syntax: 'python', note_ar: 'الصنف قالب لإنشاء الكائنات.' },
  { term: 'Object', code: 'user1 = User()  # user1 is an ______ of User', syntax: 'python', note_ar: 'الكائن نسخة من الصنف.' },
  { term: 'Method', code: 'user1.greet()  # greet is a ______ of the object', syntax: 'python', note_ar: 'الدالة المرتبطة بكائن تُسمّى دالة عضو.' },
  { term: 'Inheritance', code: 'class Admin(User):\n    pass  # Admin reuses User through ______', syntax: 'python', note_ar: 'الوراثة تعيد استخدام سلوك الصنف الأب.' },
  { term: 'Interface', code: 'interface Shape { double area(); }  # Shape defines an ______', syntax: 'java', note_ar: 'الواجهة تحدد عقدًا دون تنفيذ.' },
  { term: 'Exception', code: 'try:\n    x = 1 / 0\nexcept ZeroDivisionError:\n    pass  # ZeroDivisionError is an ______', syntax: 'python', note_ar: 'الاستثناء يمثل خطأ وقت التشغيل.' },
  { term: 'Recursion', code: 'def fact(n):\n    return 1 if n == 0 else n * fact(n - 1)  # fact uses ______', syntax: 'python', note_ar: 'الاستدعاء الذاتي هو التكرار الذاتي.' },
  { term: 'Loop', code: 'for i in range(3):\n    print(i)  # this is a ______', syntax: 'python', note_ar: 'الحلقة تكرر تنفيذ تعليمات.' },
  { term: 'Condition', code: 'if score >= 50:\n    print("pass")  # score >= 50 is a ______', syntax: 'python', note_ar: 'الشرط يحدد مسار التنفيذ.' },
  { term: 'Stack', code: 'stack = []\nstack.append(1)\nstack.pop()  # LIFO: a ______', syntax: 'python', note_ar: 'المكدس يتبع آخر داخل أول خارج.' },
  { term: 'Queue', code: 'from collections import deque\nq = deque([1, 2])\nq.popleft()  # FIFO: a ______', syntax: 'python', note_ar: 'الطابور يتبع أول داخل أول خارج.' },
  { term: 'Linked List', code: 'node.next = second  # nodes linked this way form a ______', syntax: 'javascript', note_ar: 'القائمة المترابطة تعتمد على مؤشرات بين العقد.' },
  { term: 'Hash Table', code: 'index = hash(key) % size  # maps keys into buckets: ______', syntax: 'python', note_ar: 'جدول التجزئة يربط المفاتيح بقيم بسرعة.' },
  { term: 'Binary Search', code: 'mid = (lo + hi) // 2  # repeatedly halving a sorted list: ______', syntax: 'python', note_ar: 'البحث الثنائي يقسّم النطاق المرتب على النصف.' },
  { term: 'Algorithm', code: 'steps = ["read input", "compute", "print"]  # ordered steps: ______', syntax: 'python', note_ar: 'الخوارزمية سلسلة خطوات محددة لحل مشكلة.' },
  { term: 'Compiler', code: 'gcc main.c -o main  # gcc is a ______', syntax: 'bash', note_ar: 'المُصرّف يحوّل الشيفرة قبل التشغيل.' },
  { term: 'Interpreter', code: 'python script.py  # python acts as an ______', syntax: 'bash', note_ar: 'المفسّر ينفذ الشيفرة مباشرة.' },
  { term: 'Database', code: 'CREATE DATABASE shop;  # shop is a ______', syntax: 'sql', note_ar: 'قاعدة البيانات تجمع بيانات منظمة.' },
  { term: 'Table', code: 'CREATE TABLE users (id INT);  # users is a ______', syntax: 'sql', note_ar: 'الجدول ينظم الصفوف والأعمدة.' },
  { term: 'Primary Key', code: 'id INT PRIMARY KEY  # unique row identifier: ______', syntax: 'sql', note_ar: 'المفتاح الأساسي يميز كل صف.' },
  { term: 'Foreign Key', code: 'user_id INT REFERENCES users(id)  # this is a ______', syntax: 'sql', note_ar: 'المفتاح الأجنبي يربط جدولين.' },
  { term: 'SQL', code: 'SELECT name FROM users;  # this statement is written in ______', syntax: 'sql', note_ar: 'SQL لغة الاستعلام عن البيانات العلائقية.' },
  { term: 'Index', code: 'CREATE INDEX ix_name ON users(name);  # speeds up lookups: ______', syntax: 'sql', note_ar: 'الفهرس يسرّع البحث في الجدول.' },
  { term: 'API', code: 'fetch("/api/users")  # the app calls an ______', syntax: 'javascript', note_ar: 'واجهة برمجة التطبيقات عقد تواصل بين المكونات.' },
  { term: 'HTTP', code: 'GET /index.html HTTP/1.1  # this is an ______ request', syntax: 'http', note_ar: 'HTTP بروتوكول نقل صفحات الويب.' },
  { term: 'JSON', code: '{"name": "Ali"}  # this data format is ______', syntax: 'json', note_ar: 'JSON تمثيل بيانات على شكل مفتاح وقيمة.' },
  { term: 'HTML', code: '<p>Hello</p>  # this markup is ______', syntax: 'html', note_ar: 'HTML يبني بنية صفحة الويب.' },
  { term: 'CSS', code: 'p { color: red; }  # this styling language is ______', syntax: 'css', note_ar: 'CSS تتحكم في مظهر الصفحة.' },
  { term: 'JavaScript', code: "console.log('Hello');  # this is ______", syntax: 'javascript', note_ar: 'JavaScript تضيف التفاعل للصفحة.' },
  { term: 'Git', code: 'git commit -m "Add login"  # this tool is ______', syntax: 'bash', note_ar: 'Git نظام تحكم بالإصدارات.' },
  { term: 'Commit', code: 'git commit -m "fix bug"  # this saves a ______', syntax: 'bash', note_ar: 'الالتزام لقطة من التغييرات.' },
  { term: 'Branch', code: 'git checkout -b feature/login  # creates a new ______', syntax: 'bash', note_ar: 'الفرع مسار تطوير مستقل.' },
  { term: 'Merge', code: 'git merge feature/login  # combines branches with ______', syntax: 'bash', note_ar: 'الدمج يجمع تغييرات الفروع.' },
  { term: 'Thread', code: 'new Thread(task).start();  # runs work on another ______', syntax: 'java', note_ar: 'الخيط مسار تنفيذ داخل العملية.' },
  { term: 'Process', code: 'pid = os.getpid()  # identifies the running ______', syntax: 'python', note_ar: 'العملية برنامج قيد التنفيذ.' },
  { term: 'Encryption', code: 'ciphertext = encrypt(plaintext, key)  # this is ______', syntax: 'python', note_ar: 'التشفير يحمي البيانات بمفتاح.' },
  { term: 'Hashing', code: 'digest = sha256(password)  # this is ______', syntax: 'python', note_ar: 'التجزئة تنتج بصمة غير قابلة للعكس عمليًا.' },
  { term: 'Authentication', code: 'login(username, password)  # verifies identity: ______', syntax: 'python', note_ar: 'التحقق من الهوية يثبت من أنت.' },
  { term: 'Authorization', code: 'if user.role == "admin": allow()  # checks permissions: ______', syntax: 'python', note_ar: 'التفويض يحدد ما يُسمح لك بفعله.' },
  { term: 'Framework', code: 'app = Flask(__name__)  # Flask is a ______', syntax: 'python', note_ar: 'إطار العمل يحدد هيكل التطبيق.' },
  { term: 'Library', code: 'import requests  # requests is a ______', syntax: 'python', note_ar: 'المكتبة شيفرة جاهزة تُستدعى عند الحاجة.' },
  { term: 'Kernel', code: 'uname -r  # prints the OS ______ version', syntax: 'bash', note_ar: 'النواة قلب نظام التشغيل.' },
  { term: 'Virtual Memory', code: 'address = malloc(64)  # the OS maps it to ______', syntax: 'c', note_ar: 'الذاكرة الظاهرية توسّع مساحة العنوان.' },
  { term: 'Deadlock', code: 'thread A waits for B, thread B waits for A  # this is a ______', syntax: 'text', note_ar: 'الجمود انتظار متبادل لا ينتهي.' },
  { term: 'DNS', code: 'nslookup example.com  # resolves names via ______', syntax: 'bash', note_ar: 'DNS يترجم الأسماء إلى عناوين IP.' },
  { term: 'Router', code: 'ip route  # lists routes on a ______', syntax: 'bash', note_ar: 'الموجّه يوجّه الحزم بين الشبكات.' },
  { term: 'Cloud Computing', code: 'aws s3 cp file.txt s3://bucket/  # this uses ______', syntax: 'bash', note_ar: 'الحوسبة السحابية موارد عبر الإنترنت.' },
  { term: 'Container', code: 'docker run nginx  # nginx runs inside a ______', syntax: 'bash', note_ar: 'الحاوية بيئة معزولة خفيفة.' },
  { term: 'Docker', code: 'docker build -t app .  # this tool is ______', syntax: 'bash', note_ar: 'Docker يبني ويشغّل الحاويات.' },
  { term: 'Kubernetes', code: 'kubectl get pods  # this orchestrator is ______', syntax: 'bash', note_ar: 'Kubernetes يدير الحاويات على نطاق واسع.' },
  { term: 'Virtual Machine', code: 'vagrant up  # boots a ______', syntax: 'bash', note_ar: 'الآلة الافتراضية نظام كامل داخل نظام.' },
  { term: 'Neural Network', code: 'model = Sequential([Dense(64), Dense(10)])  # builds a ______', syntax: 'python', note_ar: 'الشبكة العصبية طبقات من الخلايا.' },
  { term: 'Machine Learning', code: 'model.fit(X_train, y_train)  # this is ______', syntax: 'python', note_ar: 'تعلم الآلة يستنتج أنماطًا من البيانات.' },
  { term: 'Deep Learning', code: 'model = Sequential([Dense(128), Dense(64), Dense(10)])  # many layers: ______', syntax: 'python', note_ar: 'التعلم العميق شبكات متعددة الطبقات.' },
  { term: 'Model', code: 'model.predict(X_test)  # the trained ______ makes predictions', syntax: 'python', note_ar: 'النموذج نتيجة التدريب.' },
  { term: 'Training', code: 'for epoch in range(10): model.fit(...)  # this phase is ______', syntax: 'python', note_ar: 'التدريب يعدّل أوزان النموذج.' },
  { term: 'Dataset', code: 'df = pd.read_csv("data.csv")  # data.csv is a ______', syntax: 'python', note_ar: 'مجموعة البيانات مادة التدريب.' },
  { term: 'Feature', code: 'X = df[["age", "income"]]  # age and income are ______s', syntax: 'python', note_ar: 'الميزة خاصية تُستخدم للتنبؤ.' },
  { term: 'Overfitting', code: 'train_acc = 0.99, test_acc = 0.60  # this gap suggests ______', syntax: 'text', note_ar: 'الإفراط في التخصيص يحفظ التدريب ويفشل في الاختبار.' },
  { term: 'Bug', code: 'test failed because of a ______ in the loop', syntax: 'text', note_ar: 'الخلل البرمجي يسبب سلوكًا غير صحيح.' },
  { term: 'Debugging', code: 'breakpoint(); step_over();  # this process is ______', syntax: 'javascript', note_ar: 'التنقيح يبحث عن الأخطاء ويصلحها.' },
  { term: 'Refactoring', code: 'rename(); extract_method();  # improves code without changing behavior: ______', syntax: 'text', note_ar: 'إعادة الهيكلة تحسّن الشيفرة دون تغيير السلوك.' },
  { term: 'Design Pattern', code: 'class Singleton: ...  # Singleton is a ______', syntax: 'python', note_ar: 'نمط التصميم حل متكرر لمشكلة تصميم.' },
  { term: 'Unit Testing', code: 'assert add(2, 2) == 4  # this is a ______', syntax: 'python', note_ar: 'اختبار الوحدة يفحص أصغر جزء.' },
  { term: 'Integration Testing', code: 'test(api + database)  # this checks combined parts: ______', syntax: 'text', note_ar: 'اختبار التكامل يفحص ترابط المكونات.' },
  { term: 'Requirement', code: 'The system shall allow login  # this is a ______', syntax: 'text', note_ar: 'المتطلب وصف لما يجب أن يفعله النظام.' },
  { term: 'Use Case', code: 'Actor -> Login -> Dashboard  # this describes a ______', syntax: 'text', note_ar: 'حالة الاستخدام سيناريو تفاعل.' },
  { term: 'Agile', code: 'daily standup; sprint review;  # this methodology is ______', syntax: 'text', note_ar: 'أجايل منهجية تطوير تكراري.' },
  { term: 'Scrum', code: 'roles: product owner, scrum master, team  # this framework is ______', syntax: 'text', note_ar: 'سكرم إطار عمل أجايل.' },
  { term: 'Sprint', code: 'two weeks of planned work = one ______', syntax: 'text', note_ar: 'السبرنت فترة عمل قصيرة محددة.' },
  { term: 'Session', code: 'req.session.userId  # server-side state is a ______', syntax: 'javascript', note_ar: 'الجلسة تحفظ حالة المستخدم.' },
  { term: 'Cookie', code: 'res.cookie("token", value)  # stores data in a ______', syntax: 'javascript', note_ar: 'الكوكيز بيانات صغيرة في المتصفح.' },
  { term: 'Load Balancer', code: 'client -> ______ -> server1 / server2', syntax: 'text', note_ar: 'موازن الحمل يوزع الطلبات.' },
  { term: 'REST', code: 'GET /users/1  # this API style is ______', syntax: 'http', note_ar: 'REST نمط لتصميم واجهات الويب.' },
  { term: 'WebSocket', code: 'new WebSocket("wss://example.com")  # realtime channel: ______', syntax: 'javascript', note_ar: 'WebSocket اتصال ثنائي الاتجاه.' },
  { term: 'Polymorphism', code: 'shape.draw()  # same call, different behavior: ______', syntax: 'python', note_ar: 'تعدد الأشكال يجعل نداءً واحدًا يتصرف بطرق مختلفة.' },
  { term: 'Encapsulation', code: 'self.__balance = 0  # hides internal state: ______', syntax: 'python', note_ar: 'التغليف يخفي التفاصيل الداخلية.' },
  { term: 'Abstraction', code: 'class Car(ABC):\n    @abstractmethod\n    def start(self): ...  # this is ______', syntax: 'python', note_ar: 'التجريد يبرز المهم ويخفي التفاصيل.' },
  { term: 'Constructor', code: 'def __init__(self, name):\n    self.name = name  # __init__ is a ______', syntax: 'python', note_ar: 'المنشئ يهيّئ الكائن عند إنشائه.' },
];

// Similar-terms battles. Definitions come from the Excel Technical_Concepts sheet;
// the optional quiz fields are authored here.
export const SIMILAR_PAIRS = [
  {
    code: 'api-sdk', title_ar: 'API مقابل SDK', title_en: 'API vs SDK',
    left: { term: 'API', label: 'API' }, right: { term: 'SDK', label: 'SDK' },
    question: { prompt: 'أي مصطلح يصف حزمة أدوات كاملة لبناء تطبيق لمنصة معينة؟', answer: 'SDK',
      options: ['API', 'SDK', 'DBMS', 'HTTP'] },
  },
  {
    code: 'authn-authz', title_ar: 'Authentication مقابل Authorization', title_en: 'Authentication vs Authorization',
    left: { term: 'Authentication', label: 'Authentication' }, right: { term: 'Authorization', label: 'Authorization' },
    question: { prompt: 'أي مصطلح يحدد الصلاحيات بعد إثبات الهوية؟', answer: 'Authorization',
      options: ['Authentication', 'Authorization', 'Encryption', 'Hashing'] },
  },
  {
    code: 'compiler-interpreter', title_ar: 'Compiler مقابل Interpreter', title_en: 'Compiler vs Interpreter',
    left: { term: 'Compiler', label: 'Compiler' }, right: { term: 'Interpreter', label: 'Interpreter' },
    question: { prompt: 'أي أداة تنفّذ الشيفرة سطرًا بسطر أثناء التشغيل؟', answer: 'Interpreter',
      options: ['Compiler', 'Interpreter', 'Linker', 'Loader'] },
  },
  {
    code: 'library-framework', title_ar: 'Library مقابل Framework', title_en: 'Library vs Framework',
    left: { term: 'Library', label: 'Library' }, right: { term: 'Framework', label: 'Framework' },
    question: { prompt: 'أي مصطلح يفرض هيكل التطبيق ويستدعي شيفرتك بنفسه؟', answer: 'Framework',
      options: ['Library', 'Framework', 'Package', 'Module'] },
  },
  {
    code: 'class-object', title_ar: 'Class مقابل Object', title_en: 'Class vs Object',
    left: { term: 'Class', label: 'Class' }, right: { term: 'Object', label: 'Object' },
    question: { prompt: 'ما اسم النسخة الفعلية التي تُنشأ من صنف؟', answer: 'Object',
      options: ['Class', 'Object', 'Interface', 'Method'] },
  },
  {
    code: 'db-dbms', title_ar: 'Database مقابل DBMS', title_en: 'Database vs DBMS',
    left: { term: 'Database', label: 'Database' }, right: { term: 'DBMS', label: 'DBMS' },
    question: { prompt: 'أي مصطلح يصف البرنامج الذي يدير قاعدة البيانات ويتحكم بالوصول إليها؟', answer: 'DBMS',
      options: ['Database', 'DBMS', 'Table', 'Index'] },
  },
  {
    code: 'http-https', title_ar: 'HTTP مقابل HTTPS', title_en: 'HTTP vs HTTPS',
    left: { term: 'HTTP', label: 'HTTP' }, right: { term: 'HTTPS', label: 'HTTPS' },
    question: { prompt: 'أي بروتوكول يحمي النقل باستخدام TLS؟', answer: 'HTTPS',
      options: ['HTTP', 'HTTPS', 'FTP', 'SMTP'] },
  },
  {
    code: 'sql-nosql', title_ar: 'SQL مقابل NoSQL', title_en: 'SQL vs NoSQL',
    left: { term: 'SQL', label: 'SQL' }, right: { term: 'NoSQL', label: 'NoSQL' },
    question: { prompt: 'أي خيار يضم نماذج بيانات غير علائقية متنوعة؟', answer: 'NoSQL',
      options: ['SQL', 'NoSQL', 'DBMS', 'Index'] },
  },
  {
    code: 'frontend-backend', title_ar: 'Frontend مقابل Backend', title_en: 'Frontend vs Backend',
    left: { term: 'Frontend', label: 'Frontend' }, right: { term: 'Backend', label: 'Backend' },
    question: { prompt: 'أي جزء ينفّذ منطق الخادم ويتعامل مع قاعدة البيانات؟', answer: 'Backend',
      options: ['Frontend', 'Backend', 'UI', 'Design'] },
  },
  {
    code: 'process-thread', title_ar: 'Process مقابل Thread', title_en: 'Process vs Thread',
    left: { term: 'Process', label: 'Process' }, right: { term: 'Thread', label: 'Thread' },
    question: { prompt: 'أي مصطلح يصف مسار تنفيذ داخل العملية ويتشارك ذاكرتها؟', answer: 'Thread',
      options: ['Process', 'Thread', 'Kernel', 'Task'] },
  },
  {
    code: 'encryption-hashing', title_ar: 'Encryption مقابل Hashing', title_en: 'Encryption vs Hashing',
    left: { term: 'Encryption', label: 'Encryption' }, right: { term: 'Hashing', label: 'Hashing' },
    question: { prompt: 'أي عملية غير قابلة للعكس عمليًا وتُستخدم للتحقق من كلمات المرور؟', answer: 'Hashing',
      options: ['Encryption', 'Hashing', 'Encoding', 'Compression'] },
  },
];

export const SHOP_REWARDS = [
  { code: 'avatar-nova', name_ar: 'نوفا', name_en: 'Nova', type: 'avatar', cost: 0, rarity: 'common', asset: 'nova', description_ar: 'الشخصية الافتراضية لكل لاعب جديد.' },
  { code: 'avatar-byte', name_ar: 'بايت', name_en: 'Byte', type: 'avatar', cost: 150, rarity: 'common', asset: 'byte', description_ar: 'روبوت صغير يحب الشيفرة النظيفة.' },
  { code: 'avatar-pixel', name_ar: 'بكسل', name_en: 'Pixel', type: 'avatar', cost: 250, rarity: 'rare', asset: 'pixel', description_ar: 'فنان رقمي بعيون نيون.' },
  { code: 'avatar-cyber', name_ar: 'سايبر', name_en: 'Cyber', type: 'avatar', cost: 400, rarity: 'rare', asset: 'cyber', description_ar: 'حارس بيانات لا ينام.' },
  { code: 'avatar-quantum', name_ar: 'كوانتم', name_en: 'Quantum', type: 'avatar', cost: 700, rarity: 'epic', asset: 'quantum', description_ar: 'كائن من مستقبل الحوسبة.' },
  { code: 'avatar-legend', name_ar: 'ليجند', name_en: 'Legend', type: 'avatar', cost: 1200, rarity: 'legendary', asset: 'legend', description_ar: 'للمطورين الأسطوريين فقط.' },
  { code: 'frame-none', name_ar: 'بلا إطار', name_en: 'No Frame', type: 'frame', cost: 0, rarity: 'common', asset: 'none', description_ar: 'إطار بسيط افتراضي.' },
  { code: 'frame-neon', name_ar: 'نيون', name_en: 'Neon', type: 'frame', cost: 200, rarity: 'rare', asset: 'neon', description_ar: 'توهج سماوي حول صورتك.' },
  { code: 'frame-gold', name_ar: 'ذهبي', name_en: 'Gold', type: 'frame', cost: 450, rarity: 'epic', asset: 'gold', description_ar: 'إطار ذهبي للمكافآت.' },
  { code: 'frame-plasma', name_ar: 'بلازما', name_en: 'Plasma', type: 'frame', cost: 800, rarity: 'legendary', asset: 'plasma', description_ar: 'طاقة بنفسجية متحركة.' },
  { code: 'bg-default', name_ar: 'الفضاء العميق', name_en: 'Deep Space', type: 'background', cost: 0, rarity: 'common', asset: 'default', description_ar: 'خلفية اللعبة الأساسية.' },
  { code: 'bg-matrix', name_ar: 'المصفوفة', name_en: 'Matrix', type: 'background', cost: 300, rarity: 'rare', asset: 'matrix', description_ar: 'أرقام خضراء تنساب خلف واجهتك.' },
  { code: 'bg-sunset', name_ar: 'غروب رقمي', name_en: 'Digital Sunset', type: 'background', cost: 500, rarity: 'epic', asset: 'sunset', description_ar: 'تدرّج دافئ بين الأزرق والذهبي.' },
  { code: 'bg-aurora', name_ar: 'الشفق القطبي', name_en: 'Aurora', type: 'background', cost: 900, rarity: 'legendary', asset: 'aurora', description_ar: 'أضواء شمالية متحركة.' },
];

export const GAME_MODES = [
  { code: 'meaning', name_en: 'Guess the Meaning', name_ar: 'خمّن المعنى', description_ar: 'اختر الترجمة العربية الصحيحة للمصطلح الإنجليزي.', icon: '🔍', unlockedLevel: 1 },
  { code: 'english', name_en: 'English Challenge', name_ar: 'تحدي الإنجليزية', description_ar: 'اقرأ المعنى العربي وحدّد المصطلح الإنجليزي.', icon: '🇬🇧', unlockedLevel: 1 },
  { code: 'match', name_en: 'Match the Terms', name_ar: 'طابق المصطلحات', description_ar: 'اربط كل مصطلح إنجليزي بمعناه العربي.', icon: '🔗', unlockedLevel: 2 },
  { code: 'puzzle', name_en: 'Word Puzzle', name_ar: 'لغز الكلمات', description_ar: 'رتّب الأحرف لتكوين المصطلح الصحيح.', icon: '🧩', unlockedLevel: 3 },
  { code: 'code', name_en: 'Complete the Code', name_ar: 'أكمل الشيفرة', description_ar: 'اختر الكلمة المناسبة لإكمال المثال البرمجي.', icon: '💻', unlockedLevel: 4 },
  { code: 'speed', name_en: 'Speed Challenge', name_ar: 'تحدي السرعة', description_ar: 'أجب عن أكبر عدد من الأسئلة قبل انتهاء الوقت.', icon: '⏱️', unlockedLevel: 5 },
  { code: 'boss', name_en: 'Technical Boss Battle', name_ar: 'معركة الزعيم التقني', description_ar: 'أسئلة متدرجة لهزيمة زعيم تخصص كامل.', icon: '⚔️', unlockedLevel: 6 },
  { code: 'similar', name_en: 'Similar Terms', name_ar: 'المصطلحات المتشابهة', description_ar: 'تعلّم الفرق بين المصطلحات التي يخلط بينها المبتدئون.', icon: '⚖️', unlockedLevel: 7 },
];

export const STARTER_COINS = 250;
export const STARTER_XP = 0;

export function worldCategories() {
  const map = new Map();
  for (const w of WORLDS) for (const c of w.categories) map.set(c, w.code);
  return map;
}
