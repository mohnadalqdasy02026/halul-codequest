-- CODE QUEST — relational schema (SQLite)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- ---------------------------------------------------------------- content
CREATE TABLE IF NOT EXISTS worlds (
    id          INTEGER PRIMARY KEY,
    code        TEXT    NOT NULL UNIQUE,
    name_en     TEXT    NOT NULL,
    name_ar     TEXT    NOT NULL,
    subtitle_ar TEXT,
    description_ar TEXT,
    color       TEXT    NOT NULL,
    icon        TEXT    NOT NULL,
    sort        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
    id      INTEGER PRIMARY KEY,
    name_en TEXT    NOT NULL UNIQUE,
    name_ar TEXT    NOT NULL UNIQUE,
    world_id INTEGER NOT NULL REFERENCES worlds(id),
    sort    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subcategories (
    id          INTEGER PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name_en     TEXT    NOT NULL,
    name_ar     TEXT,
    UNIQUE(category_id, name_en)
);

CREATE TABLE IF NOT EXISTS stages (
    id             INTEGER PRIMARY KEY,
    world_id       INTEGER NOT NULL REFERENCES worlds(id),
    category_id    INTEGER NOT NULL UNIQUE REFERENCES categories(id),
    name_ar        TEXT    NOT NULL,
    name_en        TEXT    NOT NULL,
    sort           INTEGER NOT NULL,
    required_level INTEGER NOT NULL DEFAULT 1,
    xp_reward      INTEGER NOT NULL DEFAULT 60,
    coin_reward    INTEGER NOT NULL DEFAULT 15
);

CREATE TABLE IF NOT EXISTS terms (
    id                 INTEGER PRIMARY KEY,
    english            TEXT    NOT NULL,
    english_key        TEXT    NOT NULL UNIQUE,
    abbreviation       TEXT,
    full_form          TEXT,
    arabic             TEXT    NOT NULL,
    definition_ar      TEXT    NOT NULL,
    category_id        INTEGER NOT NULL REFERENCES categories(id),
    subcategory_id     INTEGER REFERENCES subcategories(id),
    subcategory        TEXT,
    difficulty         TEXT    NOT NULL,
    example            TEXT,
    related_terms      TEXT,
    stage_id           INTEGER REFERENCES stages(id),
    source_id          INTEGER,
    translation_status TEXT    NOT NULL DEFAULT 'needs_review'
                       CHECK(translation_status IN ('verified','needs_review')),
    active             INTEGER NOT NULL DEFAULT 1,
    created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS examples (
    id        INTEGER PRIMARY KEY,
    term_id   INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    code      TEXT    NOT NULL,
    language  TEXT,
    note_ar   TEXT
);

CREATE TABLE IF NOT EXISTS related_terms (
    term_id        INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    related_term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    relation       TEXT    NOT NULL DEFAULT 'related',
    PRIMARY KEY (term_id, related_term_id)
);

CREATE TABLE IF NOT EXISTS abbreviations (
    id           INTEGER PRIMARY KEY,
    abbreviation TEXT    NOT NULL UNIQUE,
    full_form    TEXT    NOT NULL,
    meaning_ar   TEXT,
    arabic_term  TEXT,
    category_id  INTEGER REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS programming_languages (
    id           INTEGER PRIMARY KEY,
    name         TEXT    NOT NULL UNIQUE,
    arabic_name  TEXT,
    primary_uses TEXT,
    difficulty   TEXT,
    paradigm     TEXT
);

CREATE TABLE IF NOT EXISTS concepts (
    id             INTEGER PRIMARY KEY,
    concept        TEXT    NOT NULL UNIQUE,
    arabic_term    TEXT,
    explanation_ar TEXT,
    difficulty     TEXT,
    is_pair        INTEGER NOT NULL DEFAULT 0,
    pair_of        TEXT
);

-- ---------------------------------------------------------------- questions
CREATE TABLE IF NOT EXISTS questions (
    id          INTEGER PRIMARY KEY,
    qkey        TEXT    NOT NULL UNIQUE,
    term_id     INTEGER REFERENCES terms(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id),
    mode        TEXT    NOT NULL,
    prompt      TEXT    NOT NULL,
    prompt_ar   TEXT,
    code        TEXT,
    answer      TEXT    NOT NULL,
    explanation TEXT,
    difficulty  TEXT,
    source      TEXT    NOT NULL DEFAULT 'generated',
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS question_options (
    id          INTEGER PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    text        TEXT    NOT NULL,
    is_correct  INTEGER NOT NULL DEFAULT 0,
    sort        INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_one_correct_option
    ON question_options(question_id) WHERE is_correct = 1;

CREATE TABLE IF NOT EXISTS game_modes (
    id            INTEGER PRIMARY KEY,
    code          TEXT    NOT NULL UNIQUE,
    name_en       TEXT    NOT NULL,
    name_ar       TEXT    NOT NULL,
    description_ar TEXT,
    icon          TEXT,
    unlocked_level INTEGER NOT NULL DEFAULT 1,
    config        TEXT
);

-- ---------------------------------------------------------------- users
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    username      TEXT    NOT NULL UNIQUE,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'player' CHECK(role IN ('player','admin')),
    status        TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','banned')),
    is_npc        INTEGER NOT NULL DEFAULT 0,
    xp            INTEGER NOT NULL DEFAULT 0,
    coins         INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name     TEXT    NOT NULL,
    avatar           TEXT    NOT NULL DEFAULT 'nova',
    frame            TEXT    NOT NULL DEFAULT 'frame-none',
    background       TEXT    NOT NULL DEFAULT 'bg-default',
    bio              TEXT,
    lang             TEXT    NOT NULL DEFAULT 'ar' CHECK(lang IN ('ar','en')),
    theme            TEXT    NOT NULL DEFAULT 'dark' CHECK(theme IN ('dark','light')),
    sound            INTEGER NOT NULL DEFAULT 1,
    music            INTEGER NOT NULL DEFAULT 0,
    daily_goal       INTEGER NOT NULL DEFAULT 20,
    current_streak   INTEGER NOT NULL DEFAULT 0,
    longest_streak   INTEGER NOT NULL DEFAULT 0,
    last_streak_date TEXT,
    total_answered   INTEGER NOT NULL DEFAULT 0,
    total_correct    INTEGER NOT NULL DEFAULT 0,
    total_time_ms    INTEGER NOT NULL DEFAULT 0,
    onboarded        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT NOT NULL UNIQUE,
    csrf         TEXT NOT NULL,
    expires_at   TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS xp_events (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount     INTEGER NOT NULL,
    source     TEXT NOT NULL,
    ref        TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS ix_xp_user_date ON xp_events(user_id, created_at);

CREATE TABLE IF NOT EXISTS user_activity (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    detail     TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS ix_activity_user ON user_activity(user_id, created_at);

-- ---------------------------------------------------------------- levels
CREATE TABLE IF NOT EXISTS levels (
    id       INTEGER PRIMARY KEY,
    level    INTEGER NOT NULL UNIQUE,
    min_xp   INTEGER NOT NULL,
    title_en TEXT NOT NULL,
    title_ar TEXT NOT NULL,
    rank_key TEXT NOT NULL,
    color    TEXT NOT NULL,
    icon     TEXT NOT NULL
);

-- ---------------------------------------------------------------- bosses
CREATE TABLE IF NOT EXISTS bosses (
    id             INTEGER PRIMARY KEY,
    code           TEXT NOT NULL UNIQUE,
    name_ar        TEXT NOT NULL,
    name_en        TEXT NOT NULL,
    category_names TEXT NOT NULL,
    icon           TEXT NOT NULL,
    color          TEXT NOT NULL,
    required_level INTEGER NOT NULL DEFAULT 1,
    xp_reward      INTEGER NOT NULL DEFAULT 250,
    coin_reward    INTEGER NOT NULL DEFAULT 80,
    title_ar       TEXT,
    description_ar TEXT,
    sort           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_bosses (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    boss_id     INTEGER NOT NULL REFERENCES bosses(id) ON DELETE CASCADE,
    best_score  INTEGER NOT NULL DEFAULT 0,
    defeated_at TEXT,
    PRIMARY KEY (user_id, boss_id)
);

-- ---------------------------------------------------------------- play
CREATE TABLE IF NOT EXISTS play_sessions (
    id           TEXT PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode         TEXT NOT NULL,
    stage_id     INTEGER REFERENCES stages(id),
    boss_id      INTEGER REFERENCES bosses(id),
    daily_key    TEXT,
    question_ids TEXT NOT NULL,
    score        INTEGER NOT NULL DEFAULT 0,
    total        INTEGER NOT NULL DEFAULT 0,
    time_ms      INTEGER NOT NULL DEFAULT 0,
    hearts       INTEGER NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','failed')),
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS play_answers (
    session_id  TEXT NOT NULL REFERENCES play_sessions(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id),
    option_id   INTEGER REFERENCES question_options(id),
    is_correct  INTEGER NOT NULL,
    time_ms     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (session_id, question_id)
);

-- ---------------------------------------------------------------- progress
CREATE TABLE IF NOT EXISTS user_progress (
    id            INTEGER PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stage_id      INTEGER NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
    status        TEXT    NOT NULL DEFAULT 'locked' CHECK(status IN ('locked','unlocked','completed')),
    stars         INTEGER NOT NULL DEFAULT 0,
    best_score    INTEGER NOT NULL DEFAULT 0,
    attempts      INTEGER NOT NULL DEFAULT 0,
    last_played_at TEXT,
    completed_at  TEXT,
    UNIQUE(user_id, stage_id)
);

CREATE TABLE IF NOT EXISTS user_terms (
    id            INTEGER PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    term_id       INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    status        TEXT    NOT NULL DEFAULT 'new'
                  CHECK(status IN ('new','learning','reviewing','mastered')),
    correct_count INTEGER NOT NULL DEFAULT 0,
    wrong_count   INTEGER NOT NULL DEFAULT 0,
    last_seen_at  TEXT,
    mastery       REAL    NOT NULL DEFAULT 0,
    updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(user_id, term_id)
);

CREATE TABLE IF NOT EXISTS learning_reviews (
    id            INTEGER PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    term_id       INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    due_at        TEXT    NOT NULL,
    interval_days INTEGER NOT NULL DEFAULT 1,
    ease          REAL    NOT NULL DEFAULT 2.5,
    repetitions   INTEGER NOT NULL DEFAULT 0,
    lapses        INTEGER NOT NULL DEFAULT 0,
    last_result   INTEGER,
    updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(user_id, term_id)
);
CREATE INDEX IF NOT EXISTS ix_reviews_due ON learning_reviews(user_id, due_at);

CREATE TABLE IF NOT EXISTS user_answers (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id),
    term_id     INTEGER REFERENCES terms(id),
    mode        TEXT NOT NULL,
    is_correct  INTEGER NOT NULL,
    time_ms     INTEGER NOT NULL DEFAULT 0,
    answer_text TEXT,
    session_id  TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS ix_answers_user ON user_answers(user_id, created_at);

CREATE TABLE IF NOT EXISTS user_mistakes (
    id             INTEGER PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id    INTEGER NOT NULL REFERENCES questions(id),
    term_id        INTEGER REFERENCES terms(id),
    count          INTEGER NOT NULL DEFAULT 1,
    last_mistake_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    resolved       INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, question_id)
);

-- ---------------------------------------------------------------- rewards
CREATE TABLE IF NOT EXISTS achievements (
    id             INTEGER PRIMARY KEY,
    code           TEXT NOT NULL UNIQUE,
    title_ar       TEXT NOT NULL,
    title_en       TEXT NOT NULL,
    description_ar TEXT,
    icon           TEXT NOT NULL,
    tier           TEXT NOT NULL DEFAULT 'bronze',
    xp_reward      INTEGER NOT NULL DEFAULT 50,
    coin_reward    INTEGER NOT NULL DEFAULT 10,
    condition_json TEXT NOT NULL,
    sort           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_achievements (
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id INTEGER NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    unlocked_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS rewards (
    id             INTEGER PRIMARY KEY,
    code           TEXT NOT NULL UNIQUE,
    name_ar        TEXT NOT NULL,
    name_en        TEXT NOT NULL,
    type           TEXT NOT NULL CHECK(type IN ('avatar','frame','background')),
    cost           INTEGER NOT NULL DEFAULT 0,
    description_ar TEXT,
    asset          TEXT NOT NULL,
    rarity         TEXT NOT NULL DEFAULT 'common',
    sort           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_rewards (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reward_id   INTEGER NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
    equipped    INTEGER NOT NULL DEFAULT 0,
    acquired_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(user_id, reward_id)
);

CREATE TABLE IF NOT EXISTS favorites (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    term_id    INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (user_id, term_id)
);

-- ---------------------------------------------------------------- daily / boss
CREATE TABLE IF NOT EXISTS daily_challenges (
    id             INTEGER PRIMARY KEY,
    challenge_date TEXT NOT NULL UNIQUE,
    question_ids   TEXT NOT NULL,
    xp_reward      INTEGER NOT NULL DEFAULT 100,
    coin_reward    INTEGER NOT NULL DEFAULT 30,
    title_ar       TEXT
);

CREATE TABLE IF NOT EXISTS user_daily (
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge_date TEXT NOT NULL,
    session_id     TEXT,
    score          INTEGER NOT NULL DEFAULT 0,
    total          INTEGER NOT NULL DEFAULT 0,
    completed_at   TEXT,
    PRIMARY KEY (user_id, challenge_date)
);

-- ---------------------------------------------------------------- subscriptions
CREATE TABLE IF NOT EXISTS subscription_plans (
    id        TEXT PRIMARY KEY,
    name_ar   TEXT    NOT NULL,
    name_en   TEXT    NOT NULL,
    price_sar INTEGER NOT NULL,
    days      INTEGER NOT NULL,
    sort      INTEGER NOT NULL DEFAULT 0,
    active    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id     TEXT    NOT NULL REFERENCES subscription_plans(id),
    amount_sar  INTEGER NOT NULL,
    days        INTEGER NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','active','rejected','cancelled','expired')),
    method      TEXT,
    reference   TEXT,
    note        TEXT,
    admin_note  TEXT,
    requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    reviewed_at TEXT,
    reviewed_by INTEGER REFERENCES users(id),
    starts_at   TEXT,
    ends_at     TEXT
);
CREATE INDEX IF NOT EXISTS ix_subscriptions_user ON subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS ix_subscriptions_status ON subscriptions(status, requested_at);

-- ---------------------------------------------------------------- multiplayer
CREATE TABLE IF NOT EXISTS mp_rooms (
    id             INTEGER PRIMARY KEY,
    code           TEXT    NOT NULL UNIQUE,
    host_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guest_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status         TEXT    NOT NULL DEFAULT 'waiting'
                   CHECK(status IN ('waiting','active','finished','cancelled')),
    question_ids   TEXT    NOT NULL,
    host_index     INTEGER NOT NULL DEFAULT 0,
    guest_index    INTEGER NOT NULL DEFAULT 0,
    host_score     INTEGER NOT NULL DEFAULT 0,
    guest_score    INTEGER NOT NULL DEFAULT 0,
    host_correct   INTEGER NOT NULL DEFAULT 0,
    guest_correct  INTEGER NOT NULL DEFAULT 0,
    host_answers   TEXT    NOT NULL DEFAULT '[]',
    guest_answers  TEXT    NOT NULL DEFAULT '[]',
    winner_id      INTEGER REFERENCES users(id),
    rewards_granted INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    started_at     TEXT,
    finished_at    TEXT
);
CREATE INDEX IF NOT EXISTS ix_mp_status ON mp_rooms(status, created_at);
CREATE INDEX IF NOT EXISTS ix_mp_host ON mp_rooms(host_id, status);
CREATE INDEX IF NOT EXISTS ix_mp_guest ON mp_rooms(guest_id, status);

-- ---------------------------------------------------------------- system
CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
    id         INTEGER PRIMARY KEY,
    period     TEXT NOT NULL,
    period_key TEXT NOT NULL,
    payload    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(period, period_key)
);

CREATE TABLE IF NOT EXISTS game_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_jobs (
    id         INTEGER PRIMARY KEY,
    filename   TEXT NOT NULL,
    status     TEXT NOT NULL,
    message    TEXT,
    inserted   INTEGER NOT NULL DEFAULT 0,
    updated    INTEGER NOT NULL DEFAULT 0,
    skipped    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS ix_terms_category ON terms(category_id, active);
CREATE INDEX IF NOT EXISTS ix_terms_stage ON terms(stage_id, active);
CREATE INDEX IF NOT EXISTS ix_questions_category ON questions(category_id, mode, active);
CREATE INDEX IF NOT EXISTS ix_options_question ON question_options(question_id);
CREATE INDEX IF NOT EXISTS ix_progress_user ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS ix_user_terms_user ON user_terms(user_id, status);
