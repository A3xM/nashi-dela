import sqlite3
import os
from datetime import datetime, date, timedelta
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List

app = FastAPI()

DB_PATH = os.environ.get(
    "DB_PATH",
    os.path.join(os.path.dirname(__file__), "family_chores.db")
)
# Создаём папку для БД если нужно (для /data на Fly.io)
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

# ── DB helpers ────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        age INTEGER,
        role TEXT DEFAULT 'child',
        pin TEXT,
        max_minutes INTEGER DEFAULT 999,
        max_tasks INTEGER DEFAULT 999,
        adhd INTEGER DEFAULT 0,
        avatar_color TEXT DEFAULT '#4A90D9',
        points INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        frequency TEXT,
        estimated_minutes INTEGER DEFAULT 15,
        min_age INTEGER DEFAULT 10
    );
    CREATE TABLE IF NOT EXISTS preferences (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        task_id INTEGER,
        score INTEGER DEFAULT 5,
        color TEXT DEFAULT 'yellow',
        UNIQUE(user_id, task_id)
    );
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY,
        week_start TEXT,
        created_by INTEGER,
        status TEXT DEFAULT 'draft',
        created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS assignments (
        id INTEGER PRIMARY KEY,
        session_id INTEGER,
        task_id INTEGER,
        user_id INTEGER,
        status TEXT DEFAULT 'pending',
        due_date TEXT,
        completed_at TEXT,
        points_awarded INTEGER DEFAULT 0,
        postpone_reason TEXT,
        postpone_to TEXT,
        is_adhoc INTEGER DEFAULT 0,
        adhoc_name TEXT
    );
    CREATE TABLE IF NOT EXISTS point_transactions (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        amount INTEGER,
        type TEXT,
        description TEXT,
        status TEXT DEFAULT 'approved',
        created_at TEXT DEFAULT (datetime('now'))
    );
    """)
    conn.commit()
    conn.close()

def seed_data():
    conn = get_db()
    c = conn.cursor()
    if c.execute("SELECT COUNT(*) FROM users").fetchone()[0] > 0:
        conn.close()
        return

    users = [
        ("Мама",  40, "admin", "1234", 9999, 999, 0, "#E8A0BF"),
        ("Майя",  17, "child", "1717",   60,  10, 0, "#5BB8F5"),
        ("Макс",  15, "child", "1515",   45,  10, 0, "#9B7FD4"),
        ("Миша",  12, "child", "1212",   30,   4, 1, "#FF8C69"),
    ]
    c.executemany(
        "INSERT INTO users (name,age,role,pin,max_minutes,max_tasks,adhd,avatar_color) VALUES (?,?,?,?,?,?,?,?)",
        users
    )

    tasks = [
        ("Убрать свои комнаты",                      "Уборка",    "weekly",    20, 10),
        ("Убрать с/у детский",                        "Уборка",    "weekly",    15, 10),
        ("Помыть лестницу с 1 на 2 этаж",             "Уборка",    "weekly",    10, 10),
        ("Помыть пол в холле на 2м этаже",            "Уборка",    "weekly",    10, 10),
        ("Помыть пол в столовой и холле на 1м этаже", "Уборка",    "weekly",    15, 12),
        ("Помыть пол в прихожей",                     "Уборка",    "weekly",    10, 10),
        ("Убрать кухню",                              "Уборка",    "weekly",    20, 12),
        ("Вывезти мусор",                             "Уборка",    "weekly",     5, 10),
        ("Полить цветы",                              "Забота",    "weekly",    10,  8),
        ("Насыпать корм/налить воду питомцам",         "Забота",    "weekly",     5,  8),
        ("Убрать у питомцев",                         "Забота",    "weekly",    10, 10),
        ("Собрать грязное белье в комнате",            "Опрятность","weekly",    10,  8),
        ("Постирать белье",                           "Опрятность","weekly",    15, 14),
        ("Разложить полотенца/постельное",             "Опрятность","weekly",    10, 10),
        ("Погладить и убрать свои вещи",               "Опрятность","weekly",    15, 12),
        ("Составить меню на неделю",                  "Питание",   "weekly",    20, 16),
        ("Купить продукты на неделю",                 "Питание",   "weekly",    30, 16),
        ("Сменить постельное белье",                  "Опрятность","biweekly",  15, 12),
        ("Помыть лестницу со 2 на 3 этаж",            "Уборка",    "biweekly",  10, 10),
        ("Влажная уборка столовой и холла",            "Уборка",    "biweekly",  20, 12),
        ("Влажная уборка прихожей",                   "Уборка",    "biweekly",  15, 12),
        ("Убрать с/у на 1м этаже",                    "Уборка",    "biweekly",  15, 12),
        ("Убрать с/у мамин",                          "Уборка",    "biweekly",  15, 16),
        ("Убрать библиотеку",                         "Уборка",    "biweekly",  20, 10),
        ("Убрать бельевую",                           "Уборка",    "monthly",   20, 12),
        ("Убрать зал",                                "Уборка",    "monthly",   25, 12),
        ("Убрать баню/парикмахерскую",                "Уборка",    "monthly",   20, 14),
        ("Убрать кабинет",                            "Уборка",    "monthly",   20, 12),
        ("Убрать террасу",                            "Уборка",    "monthly",   20, 12),
        ("Убрать игровую",                            "Уборка",    "monthly",   15, 10),
        ("Убрать лоджию",                             "Уборка",    "monthly",   20, 12),
    ]
    c.executemany(
        "INSERT INTO tasks (name,category,frequency,estimated_minutes,min_age) VALUES (?,?,?,?,?)",
        tasks
    )
    conn.commit()

    uids = {r["name"]: r["id"] for r in c.execute("SELECT id,name FROM users").fetchall()}
    tids = {r["name"]: r["id"] for r in c.execute("SELECT id,name FROM tasks").fetchall()}

    prefs = [
        # Миша
        ("Миша","Убрать свои комнаты",6,"yellow"),
        ("Миша","Убрать с/у детский",10,"green"),
        ("Миша","Помыть лестницу с 1 на 2 этаж",4,"red"),
        ("Миша","Помыть пол в холле на 2м этаже",5,"yellow"),
        ("Миша","Помыть пол в столовой и холле на 1м этаже",5,"yellow"),
        ("Миша","Помыть пол в прихожей",5,"yellow"),
        ("Миша","Убрать кухню",3,"red"),
        ("Миша","Вывезти мусор",6,"yellow"),
        ("Миша","Полить цветы",10,"green"),
        ("Миша","Насыпать корм/налить воду питомцам",10,"green"),
        ("Миша","Убрать у питомцев",9,"green"),
        ("Миша","Собрать грязное белье в комнате",8,"green"),
        ("Миша","Постирать белье",10,"green"),
        ("Миша","Разложить полотенца/постельное",7,"yellow"),
        ("Миша","Погладить и убрать свои вещи",9,"green"),
        ("Миша","Составить меню на неделю",10,"green"),
        ("Миша","Купить продукты на неделю",8,"green"),
        ("Миша","Сменить постельное белье",6,"yellow"),
        ("Миша","Помыть лестницу со 2 на 3 этаж",4,"red"),
        ("Миша","Влажная уборка столовой и холла",7,"yellow"),
        ("Миша","Влажная уборка прихожей",8,"green"),
        ("Миша","Убрать с/у на 1м этаже",10,"green"),
        ("Миша","Убрать библиотеку",8,"green"),
        ("Миша","Убрать бельевую",5,"yellow"),
        ("Миша","Убрать зал",6,"yellow"),
        ("Миша","Убрать баню/парикмахерскую",9,"green"),
        ("Миша","Убрать кабинет",2,"red"),
        ("Миша","Убрать террасу",8,"green"),
        ("Миша","Убрать игровую",5,"yellow"),
        ("Миша","Убрать лоджию",10,"green"),
        # Макс
        ("Макс","Убрать свои комнаты",5,"green"),
        ("Макс","Убрать с/у детский",3,"yellow"),
        ("Макс","Помыть лестницу с 1 на 2 этаж",2,"yellow"),
        ("Макс","Помыть пол в холле на 2м этаже",2,"yellow"),
        ("Макс","Помыть пол в столовой и холле на 1м этаже",1,"red"),
        ("Макс","Помыть пол в прихожей",1,"red"),
        ("Макс","Убрать кухню",1,"red"),
        ("Макс","Вывезти мусор",3,"yellow"),
        ("Макс","Полить цветы",5,"green"),
        ("Макс","Насыпать корм/налить воду питомцам",5,"green"),
        ("Макс","Убрать у питомцев",1,"red"),
        ("Макс","Собрать грязное белье в комнате",5,"green"),
        ("Макс","Постирать белье",2,"yellow"),
        ("Макс","Разложить полотенца/постельное",2,"yellow"),
        ("Макс","Погладить и убрать свои вещи",5,"green"),
        ("Макс","Составить меню на неделю",2,"yellow"),
        ("Макс","Купить продукты на неделю",3,"yellow"),
        ("Макс","Сменить постельное белье",4,"green"),
        ("Макс","Помыть лестницу со 2 на 3 этаж",2,"yellow"),
        ("Макс","Влажная уборка столовой и холла",3,"yellow"),
        ("Макс","Влажная уборка прихожей",1,"red"),
        ("Макс","Убрать с/у на 1м этаже",3,"yellow"),
        ("Макс","Убрать библиотеку",2,"yellow"),
        ("Макс","Убрать бельевую",1,"red"),
        ("Макс","Убрать зал",1,"red"),
        ("Макс","Убрать баню/парикмахерскую",2,"yellow"),
        ("Макс","Убрать кабинет",4,"green"),
        ("Макс","Убрать террасу",1,"red"),
        ("Макс","Убрать игровую",1,"red"),
        ("Макс","Убрать лоджию",2,"yellow"),
        # Майя
        ("Майя","Убрать свои комнаты",5,"green"),
        ("Майя","Убрать с/у детский",6,"green"),
        ("Майя","Помыть лестницу с 1 на 2 этаж",6,"green"),
        ("Майя","Помыть пол в холле на 2м этаже",6,"green"),
        ("Майя","Помыть пол в столовой и холле на 1м этаже",3,"red"),
        ("Майя","Помыть пол в прихожей",7,"green"),
        ("Майя","Убрать кухню",1,"red"),
        ("Майя","Вывезти мусор",9,"green"),
        ("Майя","Полить цветы",8,"green"),
        ("Майя","Насыпать корм/налить воду питомцам",8,"green"),
        ("Майя","Убрать у питомцев",7,"green"),
        ("Майя","Собрать грязное белье в комнате",7,"green"),
        ("Майя","Постирать белье",6,"green"),
        ("Майя","Разложить полотенца/постельное",5,"green"),
        ("Майя","Погладить и убрать свои вещи",5,"green"),
        ("Майя","Составить меню на неделю",3,"red"),
        ("Майя","Купить продукты на неделю",3,"red"),
        ("Майя","Сменить постельное белье",7,"green"),
        ("Майя","Помыть лестницу со 2 на 3 этаж",8,"green"),
        ("Майя","Влажная уборка столовой и холла",8,"green"),
        ("Майя","Влажная уборка прихожей",8,"green"),
        ("Майя","Убрать с/у на 1м этаже",9,"green"),
        ("Майя","Убрать библиотеку",3,"red"),
        ("Майя","Убрать бельевую",2,"red"),
        ("Майя","Убрать зал",1,"red"),
        ("Майя","Убрать баню/парикмахерскую",2,"red"),
        ("Майя","Убрать кабинет",4,"green"),
        ("Майя","Убрать террасу",2,"red"),
        ("Майя","Убрать игровую",1,"red"),
        ("Майя","Убрать лоджию",3,"red"),
        # Мама
        ("Мама","Убрать свои комнаты",7,"yellow"),
        ("Мама","Убрать с/у детский",6,"yellow"),
        ("Мама","Помыть лестницу с 1 на 2 этаж",6,"yellow"),
        ("Мама","Помыть пол в холле на 2м этаже",6,"yellow"),
        ("Мама","Помыть пол в столовой и холле на 1м этаже",5,"yellow"),
        ("Мама","Помыть пол в прихожей",6,"yellow"),
        ("Мама","Убрать кухню",6,"yellow"),
        ("Мама","Вывезти мусор",3,"red"),
        ("Мама","Полить цветы",4,"red"),
        ("Мама","Насыпать корм/налить воду питомцам",4,"red"),
        ("Мама","Убрать у питомцев",4,"red"),
        ("Мама","Собрать грязное белье в комнате",5,"yellow"),
        ("Мама","Постирать белье",8,"green"),
        ("Мама","Разложить полотенца/постельное",6,"yellow"),
        ("Мама","Погладить и убрать свои вещи",6,"yellow"),
        ("Мама","Составить меню на неделю",9,"green"),
        ("Мама","Купить продукты на неделю",9,"green"),
        ("Мама","Сменить постельное белье",7,"yellow"),
        ("Мама","Помыть лестницу со 2 на 3 этаж",6,"yellow"),
        ("Мама","Влажная уборка столовой и холла",5,"yellow"),
        ("Мама","Влажная уборка прихожей",5,"yellow"),
        ("Мама","Убрать с/у на 1м этаже",6,"yellow"),
        ("Мама","Убрать библиотеку",7,"yellow"),
        ("Мама","Убрать бельевую",7,"yellow"),
        ("Мама","Убрать зал",8,"green"),
        ("Мама","Убрать баню/парикмахерскую",7,"yellow"),
        ("Мама","Убрать кабинет",8,"green"),
        ("Мама","Убрать террасу",9,"green"),
        ("Мама","Убрать игровую",6,"yellow"),
        ("Мама","Убрать лоджию",9,"green"),
    ]
    for uname, tname, score, color in prefs:
        uid = uids.get(uname)
        tid = tids.get(tname)
        if uid and tid:
            c.execute(
                "INSERT OR IGNORE INTO preferences (user_id,task_id,score,color) VALUES (?,?,?,?)",
                (uid, tid, score, color)
            )
    conn.commit()
    conn.close()

# ── Distribution algorithm ────────────────────────────────────────────────────

COLOR_ORDER = {"green": 0, "yellow": 1, "red": 2}

def run_distribution(session_id: int, task_ids: list, conn):
    c = conn.cursor()
    users = [dict(u) for u in c.execute("SELECT * FROM users ORDER BY age DESC").fetchall()]
    tasks  = {t["id"]: dict(t) for t in c.execute("SELECT * FROM tasks").fetchall()}
    prefs  = {}
    for p in c.execute("SELECT * FROM preferences").fetchall():
        p = dict(p)
        prefs[(p["user_id"], p["task_id"])] = p

    capacity        = {u["id"]: {"min": u["max_minutes"], "tasks": u["max_tasks"]} for u in users}
    adhd_yellow     = {u["id"]: 0 for u in users}
    mom             = next((u for u in users if u["role"] == "admin"), None)
    assignments     = []

    for task_id in task_ids:
        task = tasks.get(task_id)
        if not task:
            continue

        candidates = []
        for u in users:
            if u["age"] < task["min_age"]:
                continue
            if u["role"] != "admin":
                if capacity[u["id"]]["tasks"] <= 0:
                    continue
                if capacity[u["id"]]["min"] < task["estimated_minutes"]:
                    continue
            pref  = prefs.get((u["id"], task_id), {"score": 3, "color": "red"})
            color = pref["color"]
            score = pref["score"]
            if u["adhd"]:
                if color == "red":
                    continue
                if color == "yellow" and adhd_yellow[u["id"]] >= 1:
                    continue
            candidates.append({
                "user": u, "color": color, "score": score,
                "rem_min": capacity[u["id"]]["min"],
            })

        if not candidates:
            chosen_user = mom
            color_chosen = prefs.get((mom["id"], task_id), {"color": "red"})["color"]
        else:
            candidates.sort(key=lambda x: (COLOR_ORDER[x["color"]], -x["score"], -x["rem_min"]))
            best = candidates[0]
            chosen_user  = best["user"]
            color_chosen = best["color"]

        u = chosen_user
        if u["role"] != "admin":
            capacity[u["id"]]["min"]   -= task["estimated_minutes"]
            capacity[u["id"]]["tasks"] -= 1
        if u.get("adhd") and color_chosen == "yellow":
            adhd_yellow[u["id"]] += 1

        pts = 0 if u["role"] == "admin" else (12 if color_chosen == "green" else 8)
        assignments.append((session_id, task_id, u["id"], "pending", pts))

    c.executemany(
        "INSERT INTO assignments (session_id,task_id,user_id,status,points_awarded) VALUES (?,?,?,?,?)",
        assignments
    )
    return assignments

# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup():
    init_db()
    seed_data()

# ── Pydantic models ───────────────────────────────────────────────────────────

class LoginBody(BaseModel):
    name: str
    pin: str

class SessionBody(BaseModel):
    task_ids: List[int]

class AdhocBody(BaseModel):
    session_id: int
    name: str
    assigned_to: int
    estimated_minutes: int = 15

class PostponeBody(BaseModel):
    reason: str
    postpone_to: str

class PrefBody(BaseModel):
    task_id: int
    score: int
    color: str

class SpendBody(BaseModel):
    minutes: int

class UserLimitBody(BaseModel):
    max_minutes: int
    max_tasks: int

# ── API ───────────────────────────────────────────────────────────────────────

@app.post("/api/login")
def login(body: LoginBody):
    conn = get_db()
    user = conn.execute(
        "SELECT * FROM users WHERE name=? AND pin=?", (body.name, body.pin)
    ).fetchone()
    conn.close()
    if not user:
        raise HTTPException(status_code=401, detail="Неверный PIN")
    return dict(user)

@app.get("/api/users")
def get_users():
    conn = get_db()
    users = [dict(u) for u in conn.execute("SELECT * FROM users ORDER BY age DESC").fetchall()]
    conn.close()
    return users

@app.get("/api/tasks")
def get_tasks():
    conn = get_db()
    tasks = [dict(t) for t in conn.execute("SELECT * FROM tasks ORDER BY frequency,category,name").fetchall()]
    conn.close()
    return tasks

@app.get("/api/session/current")
def current_session():
    conn = get_db()
    session = conn.execute(
        "SELECT * FROM sessions WHERE status='active' ORDER BY id DESC LIMIT 1"
    ).fetchone()
    if not session:
        conn.close()
        return None
    s = dict(session)
    assignments = []
    for a in conn.execute(
        """SELECT a.*, t.name as task_name, t.estimated_minutes, t.category,
                  u.name as user_name, u.avatar_color
           FROM assignments a
           LEFT JOIN tasks t ON a.task_id = t.id
           LEFT JOIN users u ON a.user_id = u.id
           WHERE a.session_id=?""", (s["id"],)
    ).fetchall():
        assignments.append(dict(a))
    s["assignments"] = assignments
    conn.close()
    return s

@app.post("/api/session")
def create_session(body: SessionBody):
    conn = get_db()
    # Close previous active sessions
    conn.execute("UPDATE sessions SET status='completed' WHERE status='active'")
    week_start = date.today().strftime("%Y-%m-%d")
    cur = conn.execute(
        "INSERT INTO sessions (week_start,status) VALUES (?,?)", (week_start, "active")
    )
    session_id = cur.lastrowid
    run_distribution(session_id, body.task_ids, conn)
    conn.commit()
    conn.close()
    return {"session_id": session_id, "status": "active"}

@app.get("/api/assignments/my/{user_id}")
def my_assignments(user_id: int):
    conn = get_db()
    session = conn.execute(
        "SELECT id FROM sessions WHERE status='active' ORDER BY id DESC LIMIT 1"
    ).fetchone()
    if not session:
        conn.close()
        return []
    rows = conn.execute(
        """SELECT a.*, t.name as task_name, t.estimated_minutes, t.category
           FROM assignments a
           LEFT JOIN tasks t ON a.task_id = t.id
           WHERE a.session_id=? AND a.user_id=?
           ORDER BY a.status, t.category""",
        (session["id"], user_id)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/assignments/{assignment_id}/done")
def mark_done(assignment_id: int):
    conn = get_db()
    a = conn.execute("SELECT * FROM assignments WHERE id=?", (assignment_id,)).fetchone()
    if not a:
        raise HTTPException(status_code=404)
    a = dict(a)
    conn.execute(
        "UPDATE assignments SET status='done', completed_at=? WHERE id=?",
        (datetime.now().isoformat(), assignment_id)
    )
    if a["points_awarded"] > 0:
        conn.execute(
            "UPDATE users SET points=points+? WHERE id=?",
            (a["points_awarded"], a["user_id"])
        )
        conn.execute(
            "INSERT INTO point_transactions (user_id,amount,type,description) VALUES (?,?,?,?)",
            (a["user_id"], a["points_awarded"], "earned",
             f"Задача выполнена #{assignment_id}")
        )
    conn.commit()
    conn.close()
    return {"ok": True, "points_awarded": a["points_awarded"]}

@app.post("/api/assignments/{assignment_id}/postpone")
def request_postpone(assignment_id: int, body: PostponeBody):
    conn = get_db()
    conn.execute(
        "UPDATE assignments SET status='postpone_requested', postpone_reason=?, postpone_to=? WHERE id=?",
        (body.reason, body.postpone_to, assignment_id)
    )
    conn.commit()
    conn.close()
    return {"ok": True}

@app.get("/api/approvals")
def pending_approvals():
    conn = get_db()
    rows = conn.execute(
        """SELECT a.*, t.name as task_name, u.name as user_name, u.avatar_color
           FROM assignments a
           LEFT JOIN tasks t ON a.task_id=t.id
           LEFT JOIN users u ON a.user_id=u.id
           WHERE a.status='postpone_requested'
           ORDER BY a.id DESC"""
    ).fetchall()
    # Point spend requests
    spend = conn.execute(
        """SELECT pt.*, u.name as user_name, u.avatar_color
           FROM point_transactions pt
           LEFT JOIN users u ON pt.user_id=u.id
           WHERE pt.status='pending' AND pt.type='spent'
           ORDER BY pt.id DESC"""
    ).fetchall()
    conn.close()
    return {
        "postpones": [dict(r) for r in rows],
        "spend_requests": [dict(r) for r in spend]
    }

@app.post("/api/approvals/postpone/{assignment_id}")
def approve_postpone(assignment_id: int, approve: bool = True):
    conn = get_db()
    new_status = "postponed" if approve else "pending"
    conn.execute(
        "UPDATE assignments SET status=? WHERE id=?",
        (new_status, assignment_id)
    )
    conn.commit()
    conn.close()
    return {"ok": True}

@app.post("/api/adhoc")
def add_adhoc(body: AdhocBody):
    conn = get_db()
    conn.execute(
        """INSERT INTO assignments
           (session_id, task_id, user_id, status, is_adhoc, adhoc_name, points_awarded)
           VALUES (?,NULL,?,?,1,?,?)""",
        (body.session_id, body.assigned_to, "pending", body.name, 8)
    )
    conn.commit()
    conn.close()
    return {"ok": True}

@app.get("/api/points/{user_id}")
def get_points(user_id: int):
    conn = get_db()
    u = conn.execute("SELECT points FROM users WHERE id=?", (user_id,)).fetchone()
    history = conn.execute(
        "SELECT * FROM point_transactions WHERE user_id=? ORDER BY id DESC LIMIT 20",
        (user_id,)
    ).fetchall()
    conn.close()
    return {"balance": u["points"], "history": [dict(r) for r in history]}

@app.post("/api/points/spend")
def spend_points(user_id: int, body: SpendBody):
    conn = get_db()
    u = dict(conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone())
    cost = body.minutes // 30 * 10
    if u["points"] < cost:
        raise HTTPException(status_code=400, detail="Недостаточно баллов")
    conn.execute(
        "INSERT INTO point_transactions (user_id,amount,type,description,status) VALUES (?,?,?,?,?)",
        (user_id, -cost, "spent", f"{body.minutes} мин экранного времени", "pending")
    )
    conn.commit()
    conn.close()
    return {"ok": True, "cost": cost}

@app.post("/api/points/spend/{tx_id}/approve")
def approve_spend(tx_id: int, approve: bool = True):
    conn = get_db()
    tx = dict(conn.execute("SELECT * FROM point_transactions WHERE id=?", (tx_id,)).fetchone())
    if approve:
        conn.execute("UPDATE point_transactions SET status='approved' WHERE id=?", (tx_id,))
        conn.execute(
            "UPDATE users SET points=points+? WHERE id=?",
            (tx["amount"], tx["user_id"])
        )
    else:
        conn.execute("UPDATE point_transactions SET status='rejected' WHERE id=?", (tx_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.get("/api/preferences/{user_id}")
def get_preferences(user_id: int):
    conn = get_db()
    rows = conn.execute(
        """SELECT p.*, t.name as task_name, t.category, t.frequency
           FROM preferences p JOIN tasks t ON p.task_id=t.id
           WHERE p.user_id=? ORDER BY t.category, t.name""",
        (user_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.put("/api/preferences/{user_id}")
def update_preference(user_id: int, body: PrefBody):
    conn = get_db()
    conn.execute(
        """INSERT INTO preferences (user_id,task_id,score,color) VALUES (?,?,?,?)
           ON CONFLICT(user_id,task_id) DO UPDATE SET score=excluded.score, color=excluded.color""",
        (user_id, body.task_id, body.score, body.color)
    )
    conn.commit()
    conn.close()
    return {"ok": True}

@app.put("/api/users/{user_id}/limits")
def update_limits(user_id: int, body: UserLimitBody):
    conn = get_db()
    conn.execute(
        "UPDATE users SET max_minutes=?, max_tasks=? WHERE id=?",
        (body.max_minutes, body.max_tasks, user_id)
    )
    conn.commit()
    conn.close()
    return {"ok": True}

@app.get("/api/stats")
def get_stats():
    conn = get_db()
    session = conn.execute(
        "SELECT id FROM sessions WHERE status='active' ORDER BY id DESC LIMIT 1"
    ).fetchone()
    if not session:
        conn.close()
        return []
    rows = conn.execute(
        """SELECT u.name, u.avatar_color,
                  COUNT(*) as total,
                  SUM(CASE WHEN a.status='done' THEN 1 ELSE 0 END) as done,
                  SUM(CASE WHEN a.status='pending' THEN 1 ELSE 0 END) as pending
           FROM assignments a JOIN users u ON a.user_id=u.id
           WHERE a.session_id=?
           GROUP BY u.id""",
        (session["id"],)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

# ── Static files ──────────────────────────────────────────────────────────────

static_dir = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/{full_path:path}")
def spa(full_path: str):
    return FileResponse(os.path.join(static_dir, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
