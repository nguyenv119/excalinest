#!/usr/bin/env bash
# Populates the knowledge canvas from NOTES.md content.
# Run once against a clean canvas: bash scripts/populate-canvas.sh
# Server must be running on localhost:3001.
set -e

python3 << 'PYEOF'
import json
import urllib.request
import urllib.error
import sys

BASE = "http://localhost:3001"

def post(path, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"ERROR {e.code} on POST {path}: {body}", file=sys.stderr)
        raise

def create_node(title, x=0, y=0, notes="", parent_id=None):
    p = {"title": title, "x": x, "y": y, "notes": notes}
    if parent_id:
        p["parent_id"] = parent_id
    result = post("/nodes", p)
    return result["id"]

def patch(path, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="PATCH"
    )
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)

def create_edge(source_id, target_id, stroke_style=None):
    result = post("/edges", {"source_id": source_id, "target_id": target_id})
    if stroke_style:
        patch(f"/edges/{result['id']}", {"stroke_style": stroke_style})

# ── 1. ROOT NODES ──────────────────────────────────────────────────────────────
print("Creating root nodes...")
lang_id = create_node("Language & Runtime",        x=0,    y=0)
conc_id = create_node("Concurrency & Parallelism", x=800,  y=0)
web_id  = create_node("Web Servers & Frameworks",  x=800,  y=1400)
stor_id = create_node("Storage & Databases",       x=1700, y=0)
dist_id = create_node("Distributed Systems",       x=1700, y=1400)
srch_id = create_node("Search & Indexing",         x=2600, y=0)
test_id = create_node("Testing",                   x=2600, y=500)
infr_id = create_node("Infrastructure",            x=2600, y=900)
print(f"  lang={lang_id[:8]} conc={conc_id[:8]} web={web_id[:8]} stor={stor_id[:8]}")
print(f"  dist={dist_id[:8]} srch={srch_id[:8]} test={test_id[:8]} infr={infr_id[:8]}")

# ── 2. SUB-CATEGORY NODES ──────────────────────────────────────────────────────
print("Creating sub-category nodes...")
async_id = create_node("Async I/O",   parent_id=conc_id, x=20, y=580)
apis_id  = create_node("APIs & Auth", parent_id=web_id,  x=20, y=580)
cache_id = create_node("Caching",     parent_id=dist_id, x=20, y=760)
print(f"  async={async_id[:8]} apis={apis_id[:8]} cache={cache_id[:8]}")

# ── 3. LEAF NODES ──────────────────────────────────────────────────────────────
print("Creating leaf nodes: Language & Runtime...")

y = 60
create_node("CPython, how Python runs", parent_id=lang_id, x=20, y=y, notes="""\
- Interpreter + runtime implemented in C
- .py → bytecode (when python3 <fileName>.py) → binary
- CPython interpreter loops across bytecode and has some optimizations\
""")

y += 70
create_node("Python Namespaces vs Packages", parent_id=lang_id, x=20, y=y, notes="""\
- **Module:** a `.py` file.
- **Package:** a directory treated as a module namespace (traditionally requires `__init__.py`).
- **Namespace package:** can span multiple directories *without* `__init__.py` (PEP 420).
- **Import behavior:**
    - If `namespace_x` exists across multiple paths, Python can merge them as a namespace package.
    - If you add `__init__.py`, it becomes a *regular package* and import resolution changes (it stops being "merged across dirs" in the namespace-package sense).\
""")

y += 70
create_node("Dunder Variables", parent_id=lang_id, x=20, y=y, notes="""\
- "Double underscore" names used by Python conventions/runtime.
- Examples:
    - `__name__`, `__file__`, `__init__`, `__repr__`, `__len__`
    - `__dict__`, `__slots__` (memory/layout behavior)\
""")

y += 70
create_node("Types vs Interfaces (TypeScript)", parent_id=lang_id, x=20, y=y, notes="""\
- Both represent shapes; both can extend existing functionality (add another attr)
- Types can
    - alias simple types → `type UserID = string`
    - computed types (types from other shapes) → `type ReadUserID = ReadOnly<UserID>`
    - Have unions, intersections between shapes\
""")

y += 70
create_node("@classmethod / Factory Pattern", parent_id=lang_id, x=20, y=y, notes="""\
```python
# WalRecord class only has a standard constructor, and we need JSON -> WALRecord
# Instead of
dummy_record = WalRecord()
json_record = dummy_record.from_json(....)

# We can have
WalRecord.from_json()

# Using a @classmethod... This works in the factory pattern. We can have
# .from_csv, .from_txt...etc
@classmethod
def from_json(cls, json_str: str) -> WalRecord:
    data = json.loads(json_str)
    return cls(
        lsn=data["lsn"],
        txn=data["txn"],
        operation=Operation(data["operation"]),
        key=data["key"],
        value=data.get("value")
    )

# cls references the class itself, not the instance of it
```\
""")

y += 70
create_node("Pickling in Python", parent_id=lang_id, x=20, y=y, notes="""\
- Stores data and metadata\
""")

y += 70
create_node("System PATH vs Python PATH", parent_id=lang_id, x=20, y=y, notes="""\
TBD\
""")

y += 70
create_node("Reading/Writing Files in Python", parent_id=lang_id, x=20, y=y, notes="""\
```python
from pathlib import Path

# TXT
# Reads on-demand, 1 line at a time, like an iterator (same as generator ish)
# Technically blocking, but non-blocking in the sense of reading 1 line only
with open(Path(file_path), mode) as file:  # With = context manager for setup
    for line in file:
        for word in line.split():
            print(word)
    contents = file.read()
    file.write(contents)

# To stream JSON elements
# Option 1: for lists
import ijson  # pip install ijson
with open(Path(file_path), 'rb') as file:  # ijson needs bytes, so 'rb'
    for item in ijson.items(file, <pathToList>.item):  # .item is for each
        yield item

# Option 2: for nested elements
import json
with open(Path(file_path), 'r') as file:
    contents: dict = json.load(file)  # Must load in completely
    for item in contents["path"]["to"]["item"].values():
        yield item
```

Modes:
- `r` read
- `w` write (truncate)
- `a` append
- `r+` read/write
- `w+` write/read (truncate)\
""")

# ── Concurrency & Parallelism ──────────────────────────────────────────────────
print("Creating leaf nodes: Concurrency & Parallelism...")

y = 60
create_node("Concurrency vs Parallelism vs Multithreading", parent_id=conc_id, x=20, y=y, notes="""\
- **Concurrency:** many tasks in progress (interleaving).
- **Parallelism:** many tasks literally at once (multiple CPU cores).
- **Threads:** concurrency tool; in Python, CPU-bound threads are limited by GIL, but I/O-bound benefits.\
""")

y += 70
create_node("Locks, Mutexes, Semaphores, Condition Variables", parent_id=conc_id, x=20, y=y, notes="""\
- **Mutex/Lock:** exclusive access to a critical section (one at a time).
- **Semaphore:** counter of permits that limits concurrency (throttle).
    - acquire decrements; release increments; blocks if 0.
- **Condition variable:** wait/notify mechanism (e.g., producer/consumer).
    - Used with a lock to sleep until a condition becomes true.\
""")

y += 70
create_node("RWLocks vs Regular Mutexes", parent_id=conc_id, x=20, y=y, notes="""\
```python
from readerwriterlock.rwlock import RWLockFair
RWLockFair().gen_rlock()
RWLockFair().gen_wlock()
```\
""")

y += 70
create_node("Executor Queue vs OS Scheduler Queue", parent_id=conc_id, x=20, y=y, notes="""\
- **Executor queue**
    - User-space task queue: schedules futures to available threads
    - Allocates OS threads to this space in opening context (with keyword)
    - If num_threads > num_futures_submitted, they wait in an internal queue
- **OS scheduler queue:** kernel-level run queue (which threads get CPU).\
""")

y += 70
create_node("Futures, ThreadPoolExecutor, wait(), .result()", parent_id=conc_id, x=20, y=y, notes="""\
TBD\
""")

y += 70
create_node("Dynamic Thread Pool Balancing", parent_id=conc_id, x=20, y=y, notes="""\
**Problem:** traffic mix shifts (60/40 → 90/10 → 10/90). Fixed pool N needs adaptive allocation.

**Pattern:** N permanent worker threads + two queues + semaphores that cap concurrency per class.

- `get_sem` = max concurrent GET tasks
- `set_sem` = max concurrent SET tasks
- A controller recomputes permits every X seconds using rps + latency (avg/p99) + queue depth.

Conceptual worker loop:

```python
def worker_loop():
    while True:
        # Prefer whichever class has backlog + permits
        if get_queue and get_sem.try_acquire():
            task = get_queue.get()
            try:
                task()
            finally:
                get_sem.release()
        elif set_queue and set_sem.try_acquire():
            task = set_queue.get()
            try:
                task()
            finally:
                set_sem.release()
        else:
            sleep(short)
```

How it runs:
- Start N workers once (via `ThreadPoolExecutor` or manual threads)
- Requests enqueue tasks into `get_queue` or `set_queue`
- Controller periodically adjusts `get_sem` / `set_sem` permit counts\
""")

y += 70
create_node("Context Switching (asyncio vs manual threading)", parent_id=conc_id, x=20, y=y, notes="""\
- No preemptive context switching in asyncio: no locks needed
    - Only when we yield though and are in a CS\
""")

# ── Async I/O children ─────────────────────────────────────────────────────────
print("Creating leaf nodes: Async I/O...")

y = 60
create_node("Blocking vs Non-Blocking IO", parent_id=async_id, x=20, y=y, notes="""\
Can our program do other work in the meantime?

- Blocking: `file.flush()`, `os.fsync(file.fileno())`, `requests.get()`...etc
- Non-blocking: `async with httpx.AsyncClient()`:
    - `await <stuff>` can yield, not block, give other requests a turn\
""")

y += 70
create_node("AsyncIO", parent_id=async_id, x=20, y=y, notes="""\
- Package provides concurrency via event loop with main thread
- Handles scheduling, IO, in async code\
""")

y += 70
create_node("Async Context Managers", parent_id=async_id, x=20, y=y, notes="""\
- `async with` calls `__aenter__` and `__aexit__` instead of `__enter__` and `__exit__` in our context manager (it has to already implement these)
- This allows our single-main threaded event loop to not block other tasks from running while opening/closing the context manager\
""")

y += 70
create_node("Coroutines, Tasks, and ordering of async work", parent_id=async_id, x=20, y=y, notes="""\
```python
async def func(seconds):
    await <sendsAPIReq>  # Blocks a task, not the thread/event loop

async def main():
    async_func = func()  # async_func is a coroutine
    taskA = asyncio.create_task(async_func(1))  # task = Task (scheduled coroutine on the event loop)
    taskB = asyncio.create_task(async_func(2))  # .create_task() runs the task

    # Option 1: If want strict ordering but concurrent
    await taskA
    await taskB

    # Option 2 (pretend we added them to tasks[]). Fan-out, many awaitables into one big awaitable.
    asyncio.gather(*tasks)

    # Option 3: truly sequential, if want strict ordering of events
    await create_task(async_func(3))
    await create_task(async_func(4))

asyncio.run(main())
```

- Tasks live outside of the `main` code flow
- Hitting `await taskA` or `.gather` pauses `main` code flow, but not event loop, which can still run tasks, such as sending bytes to IO socket buffers\
""")

y += 70
create_node(".gather vs .map vs .imap_unordered", parent_id=async_id, x=20, y=y, notes="""\
Which one takes many positional arguments, which one takes an iterable?\
""")

# ── Web Servers & Frameworks ───────────────────────────────────────────────────
print("Creating leaf nodes: Web Servers & Frameworks...")

y = 60
create_node("ASGI, WSGI, Threadpools, and Event Loops", parent_id=web_id, x=20, y=y, notes="""\
- ASGI + WSGI (asynchronous/web server gateway interface) is a **`protocol`** for how python webservers (uvicorn) communicate with python web app/frameworks
- ASGI built on top of `asyncio`
- In ASGI, no matter how many threads or processes we specify, allocates worker threads in a `threadpool` to offload sync endpoints/tasks
- Event loop has one thread; `async` methods go there
    - In ASGI servers, async functions allocated to event loop. Avoid non-blocking IO to not block single thread running in event loop\
""")

y += 70
create_node("Uvicorn", parent_id=web_id, x=20, y=y, notes="""\
- Type of ASGI web server
- Uvicorn spawns 2 processes; parent (serves API reqs) + child (watches code and dies on code change)
- Use `kill <PIDs....>` or `kill -9 <PIDs...>` if want to kill processes. Verify PIDs by `lsof -i :<PORT NUMBER>`\
""")

y += 70
create_node("Flask, FastAPI, Django", parent_id=web_id, x=20, y=y, notes="""\
- Python framework
- TBD\
""")

y += 70
create_node("Isolating Requests in Different Web-Server Models", parent_id=web_id, x=20, y=y, notes="""\
- Threading
    - Use `from contextvars import ContextVar`
    - Multiple threads
    - Async Contexts/Virtual Threads
        - This is what `asyncio.create_task` creates
- Multiple processes\
""")

y += 70
create_node("Ports in VMs", parent_id=web_id, x=20, y=y, notes="""\
```bash
uvicorn app:app --reload
```\
""")

# ── APIs & Auth children ───────────────────────────────────────────────────────
print("Creating leaf nodes: APIs & Auth...")

y = 60
create_node("Path, Query, Body, Header Params in APIs", parent_id=apis_id, x=20, y=y, notes="""\
- Path: identify specific resources
- Query: limits, filtering, sorting
- Header: Authorization, metadata
- Body: data sent to create/update/delete

```python
POST v1/kv/{key}?pattern=fast
-H 'Authorization: Bearer {API_KEY}'
-d '{
    "value": "123"
}'

# Path: v1, kv, {key}
# Query: pattern
# Header: Authorization
# Body: value
```\
""")

y += 70
create_node("API Idempotency", parent_id=apis_id, x=20, y=y, notes="""\
- **Goal:** repeating the same request doesn't cause duplicated effects.
- **Common approach:** client sends `Idempotency-Key`; server stores result keyed by it.
- Great for payments / retries.\
""")

y += 70
create_node("Authentication & Authorization", parent_id=apis_id, x=20, y=y, notes="""\
- API asks 'who is this user and are they allowed to perform such task' — authentication then authorization
- API Keys: server-server APIs
- Customer-facing APIs
    - JWT Tokens: hashed user data as tokens. Server validates on every request
    - Session Tokens: token → {user_data}. Needs to DB/cache validate every request (latency and mgmt)
    - Both can use access token + refresh token pattern
    - Both can use role-based access control (RBAC)

```python
# Client sends
{
    'user_id': '123'
    'email': '...@gmail.com'
    'role': 'admin'
    'exp': 123456789
}

# Server hashes:
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
eyJ1c2VyX2lkIjoiMTIzIiwiZW1haWwiOiJh...

# On request -> GET bookings/{booking_id}
# Authentication checks hashes and decodes
# Authorization ->

if role == 'admin': return True
return booking.user_id == user.user_id
```\
""")

y += 70
create_node("Rate Limiter Algorithms", parent_id=apis_id, x=20, y=y, notes="""\
1. Leaky Bucket
2. Token Bucket
3. Fixed Counter
4. Sliding Window Counter\
""")

y += 70
create_node("Offset vs Cursor Pagination", parent_id=apis_id, x=20, y=y, notes="""\
- Offset: start at offset from 0 and limit data fetched
    - Easy to implement; can be messy with dynamic data: can shift
- Cursor: point to specific event and limit data fetched
    - Helpful for dynamic datasets; real-time data\
""")

y += 70
create_node("TCP Stream vs Application-Layer Protocol", parent_id=apis_id, x=20, y=y, notes="""\
TBD\
""")

y += 70
create_node("Local vs Session Storage vs Cookies", parent_id=apis_id, x=20, y=y, notes="""\
TBD\
""")

y += 70
create_node("Auth in AWS", parent_id=apis_id, x=20, y=y, notes="""\
TBD\
""")

y += 70
create_node("Blob Storage", parent_id=apis_id, x=20, y=y, notes="""\
- Presigned URLs; client → S3 directly
- Batching directly to S3; 50mb chunks (should be fingerprinted)\
""")

y += 70
create_node("Pubsub vs EDA vs MQ", parent_id=apis_id, x=20, y=y, notes="""\
- Key idea is a publisher (emits events) + subscriber/consumer (works on that event)
- Hook: publisher (react comp mounting) + subscriber (callback in `useEffect`)
    - In memory
- Webhook: publisher (any event → http call) + subscriber (receiver of http call)
    - Over network, 1 http call
    - Fancy post request
- EDA: services reacting to events; not polling
- MQ: publisher publishes to ↔ broker ↔ consumer consumes
- Pubsub: publisher publishes to ↔ broker (a topic) ↔ consumer consumes after subscribed to a topic in the broker\
""")

# ── Storage & Databases ────────────────────────────────────────────────────────
print("Creating leaf nodes: Storage & Databases...")

y = 60
create_node("Different Buffers", parent_id=stor_id, x=20, y=y, notes="""\
- Application buffers: in-file buffer, i.e `self.buffer = []`, call `file.write()` →
- User-space language buffer (Python, Java)...etc; in Python, call `flush()` →
- Kernel buffer/RAM; survives process crashes; call `os.fsync(file_directory)` →
- Disk, survives crashes\
""")

y += 70
create_node(".db-shm vs .db-wal", parent_id=stor_id, x=20, y=y, notes="""\
- shm = shared memory
- .db-shm coordinates between many R and W request units with in-memory state in RAM
- Still lock .db-wal for writes\
""")

y += 70
create_node("WAL + Replication + Strong Consistency", parent_id=stor_id, x=20, y=y, notes="""\
- **WAL (write-ahead log):** append-only log on disk. Sequential writes → efficient, durable.

```json
{"lsn":100, "tx": 77, "op": "PUT", "key": "alice", "value": 100}
{"lsn":101, "tx": 77, "op": "DEL", "key": "bob"}
{"lsn":102, "tx": 77, "op": "COMMIT"}
```

- **Core idea:** commit once the **log record** is durable; data pages can be updated later (checkpointing).
- **Replication:** replicate **WAL entries** across nodes, not random data pages.
    - Heartbeats contain `last_flushed_lsn`: leader has up to this lsn, fetch if need
    - Store this in a `checkpoint.json` or log directly; can heartbeat this
- **Linearizability:** operations appear in one global order consistent with real time (if A completes before B starts, B sees A).
- **Important nuance:** pages can lag; correctness comes from **log order + commit rules + read gating**.\
""")

y += 70
create_node("LSM Trees + SSTables vs B-trees", parent_id=stor_id, x=20, y=y, notes="""\
- LSM Trees + SSTables
    - O(logn) writes amortized in memory to LSM tree (BBST)
    - Writes to sorted list on disk (SSTables)
    - Fast writes, slower reads
- B-trees
    - Writes entirely on disk
    - Great for specific/range reads, sorted data together\
""")

y += 70
create_node("Clustered vs Nonclustered Indices in SQL", parent_id=stor_id, x=20, y=y, notes="""\
- Both: indexes give you a fast entry point
- Clustering determines whether sequential progress is cheap or expensive
    - Clustered: physically sorted on data file
    - Nonclustered: need to walk through O(logn) index file again, potentially on different page/block every time\
""")

y += 70
create_node("Partition Key + Sorted Key in DynamoDB", parent_id=stor_id, x=20, y=y, notes="""\
- Region (us-east-1) → 3 AZ → (many replicas)
- "Your keys will live in 3 AZs per region, in 1 replica somewhere per AZ"
- Physical nodes can change internally in AZs
- Partition Key: hash → virtual partition → AWS internal map → AWS physical nodes
- Sorted Key
    - e.g. authors + books in SQL just 2 tables, book FK to author
    - Since Dynamo is KV, need partition by author_id and sorted_key by UUID7 book_id\
""")

y += 70
create_node("SQL vs Mongo vs Cassandra", parent_id=stor_id, x=20, y=y, notes="""\
- SQL:
    - Relational/normalized data
    - Have transactional ACID guarantees; may need 2PC for writes if sharded
    - Good for user login
    - Uses B-trees, better reads in theory. But normalized data if sharded slows things down

Denormalized data: updates can be slow

- Mongo/DynamoDB
    - Large nested documents (good locality); denormalized
    - Uses b-trees and txns supported
    - Good reads!
- Cassandra
    - Multileader/leaderless replication schema + lsm tree and sstable → super fast writes
    - Uses last-write-wins
    - Slow updates but very rare, append only!

## Blackboxed Decision Tree:

| Need | Choose | Why |
| --- | --- | --- |
| ACID transactions | SQL | 2PC for distributed, but guarantees consistency |
| Complex queries (reports, JOINs) | SQL | B-trees + query optimizer |
| Flexible schema, nested data | MongoDB | Embedded documents, no JOINs |
| Massive write throughput | Cassandra | LSM tree, no coordination |
| Read-heavy, rarely update | MongoDB | Denormalized, fast single reads |
| Write-once, never update | Cassandra | Denormalization doesn't hurt |\
""")

y += 70
create_node("ACID in NoSQL vs SQL", parent_id=stor_id, x=20, y=y, notes="""\
- Usually in SQL, when horizontally scaling, you use 2pl + 2pc to handle atomicity and isolation respectively
- For NoSQL and horizontally scaling, using 2pl + 2pc is too expensive for write-throughputs, so skip\
""")

y += 70
create_node("Nested Txns; Transactions vs Durability", parent_id=stor_id, x=20, y=y, notes="""\
TBD\
""")

y += 70
create_node("Optimistic Concurrency / Session Guarantees (RYW)", parent_id=stor_id, x=20, y=y, notes="""\
- **Read-Your-Writes (RYW):** after you write, your later reads must reflect it.
- Mechanism: server returns a **token** (often LSN/commit index/version). Client includes it on subsequent reads.
- If a replica is behind that token, it must:
    1. catch up, or
    2. forward/redirect read to leader/fresher replica.

Note: RYW is a session guarantee, not full multi-key transactional correctness.\
""")

# ── Distributed Systems ────────────────────────────────────────────────────────
print("Creating leaf nodes: Distributed Systems...")

y = 60
create_node("Replication Schemas (high level)", parent_id=dist_id, x=20, y=y, notes="""\
- **Leader/follower (primary/replica):** leader accepts writes; replicas follow.
- **Quorum/consensus:** commit requires majority agreement.
- **Async replication:** faster, can be stale (eventual).
- **Sync replication:** slower, stronger read/write guarantees.\
""")

y += 70
create_node("Single / Multi / Leaderless Replication", parent_id=dist_id, x=20, y=y, notes="""\
- Single leader
    - W go to 1; R any
- Multi-leader
    - W go to small subset of leaders; R any
- Leaderless
    - W and R goes to all nodes\
""")

y += 70
create_node("Consistent vs Modulo-based Hashing", parent_id=dist_id, x=20, y=y, notes="""\
TBD\
""")

y += 70
create_node("Zookeeper as a Metadata Store", parent_id=dist_id, x=20, y=y, notes="""\
TBD\
""")

y += 70
create_node("Region vs AZ", parent_id=dist_id, x=20, y=y, notes="""\
TBD\
""")

y += 70
create_node("Relative Latencies", parent_id=dist_id, x=20, y=y, notes="""\
- Function call: 1ns → 10^-9s
- Disk read (with index): 1ms: 10^-3ms
- Disk scan (no index): 50-100ms-seconds: 10^-1s
- Disk write (with index): 5ms-20ms: 2 * 10^-2s
- Redis get: 1 micro-second: 10^-6s
- Same AZ network call: 1ms → 10^-3s
- Coast to coast network call: 100ms → 10^-1s
- Seemingly instantaneous for humans: ≤ 200ms\
""")

y += 70
create_node("Relative Capacities", parent_id=dist_id, x=20, y=y, notes="""\
- 1 EC2 instance: 1000 qps
- 1 Redis instance: 100k qps
- 1 Postgres instance: 1k-10k qps
- Strongly replicated write: 100-1000 qps\
""")

y += 70
create_node("2PC + 2PL", parent_id=dist_id, x=20, y=y, notes="""\
- **2PL:** locking protocol for serializability (hold locks until commit).
- **2PC:** atomic commit across nodes (prepare → commit/abort).
- Combine when you need **cross-shard atomicity + isolation**.
- Known downside: can block if coordinator fails at the wrong time.\
""")

y += 70
create_node("Strongly Consistent vs Consistency in ACID", parent_id=dist_id, x=20, y=y, notes="""\
TBD\
""")

# ── Caching children ───────────────────────────────────────────────────────────
print("Creating leaf nodes: Caching...")

y = 60
create_node("Lazy, Write-through, Write-back", parent_id=cache_id, x=20, y=y, notes="""\
Watch out for thundering herd

### Lazy Caching / Cache-Aside

**Reads**
1. App → Cache
2. Miss: App → DB → Update Cache → Return
3. Hit: Return

**Writes** (app determines write path)
1. Option A: writes to cache too: App → DB → App → Cache
    - Good if only write to cache hot keys
2. ✅ Option B: truly lazy, only populate cache on miss: App → DB
    - Meh write throughput, good read throughput
    - Eventually consistent

Use: profile pages

**Use TTL/Eviction Policy to not bloat, and leases**

### Write-Through

**Reads**
1. Same

**Writes** (app not in write path)
1. App → Cache → DB
    - Strongly consistent/linearizable
    - Slow write throughput

Use: auth tokens

**Still use TTL/Eviction Policy to not bloat and leases**

### Write-back

**Reads**
1. Same

**Writes**
1. App → Cache → Async write to DB, returns immediately
    - Best write-throughput, **eventually** consistent
    - DB not SOT; Cache needs to maintain WAL log for durability
    - Cache log in WAL, maintain `last_flushed_db_lsn` on db.
    - On cache crash, snapshot from DB and apply from `last_flushed_db_lsn` to current last lsn on WAL; then trim WAL
    - Async background thread writes to DB, returns to client after WAL append

TTL/Eviction: "This key must not remain *resident* after time T", or after eviction, **not** "this key may be dropped at T".

Use: metrics, logging\
""")

y += 70
create_node("Redis In-Memory Async Replication", parent_id=cache_id, x=20, y=y, notes="""\
- Clusters; hash by slot (1-16384) and by section. Primary-replicas arch. EDA-streamed to replicas with persistent TCP connection\
""")

y += 70
create_node("Gutter Caches", parent_id=cache_id, x=20, y=y, notes="""\
TBD\
""")

y += 70
create_node("Hot/Cold Caching, Sharding + Replication", parent_id=cache_id, x=20, y=y, notes="""\
TBD\
""")

y += 70
create_node("Leases for Caching", parent_id=cache_id, x=20, y=y, notes="""\
TBD\
""")

y += 70
create_node("Sentinel Values", parent_id=cache_id, x=20, y=y, notes="""\
TBD\
""")

# ── Search & Indexing ──────────────────────────────────────────────────────────
print("Creating leaf nodes: Search & Indexing...")

y = 60
create_node("Elasticsearch", parent_id=srch_id, x=20, y=y, notes="""\
- **What it is:** Open-source, distributed search/analytics engine (document store + search). Stores and returns data as **JSON documents**.
- **How it organizes data:** Documents live in **indices** (like tables), split into **shards** (for scale) and often **replicated** (for fault tolerance).
- **Core structure:** **Inverted index**: `term -> list of documents/positions` (fast text search without scanning full text).
- **Search vs filter:**
    - **Search/query** = scoring/ranking (relevance)
    - **Filter** = boolean include/exclude (no scoring, often cached, faster)\
""")

y += 70
create_node("Static Search (client-side)", parent_id=srch_id, x=20, y=y, notes="""\
- **Approach:** Build-time generates a JSON search index (or multiple indices per version/page).
- **Runtime:** Browser loads the JSON index and searches locally (often with debouncing to avoid searching on every keystroke).
- **Typical schema:**

```json
{"version":"1.2.3","title":"...","url":"/docs/...","text":"..."}
```

- **Debounce:** Wait ~X ms after typing stops before searching.\
""")

# ── Testing ────────────────────────────────────────────────────────────────────
print("Creating leaf nodes: Testing...")

y = 60
create_node("vitest / vi.fn() Cheatsheet", parent_id=test_id, x=20, y=y, notes="""\
```tsx
vi.fn() — the full picture

vi.fn() creates a mock function. Think of it as an object with two roles: it's callable
like a function, and it has a .mock property that records everything that ever happened
to it.

Here's what lives on a vi.fn() mock:

Recording what happened (.mock)
fetchMock.mock.calls        // array of argument lists for every call
                            // e.g. [["https://ntfy.sh/topic", {method:"POST"}]]
fetchMock.mock.results      // array of {type, value} for every return
fetchMock.mock.instances    // array of `this` for each call (for constructors)
fetchMock.mock.callCount    // how many times it was called

Controlling what it returns
.mockReturnValue(x)         // always return x (sync)
.mockResolvedValue(x)       // always return Promise.resolve(x) — for async callers
.mockRejectedValue(err)     // always return Promise.reject(err) — simulate failures
.mockReturnValueOnce(x)     // return x only for the next call, then revert
.mockResolvedValueOnce(x)   // same, but async
.mockImplementation(fn)     // replace the whole body with a real function
.mockImplementationOnce(fn) // same, once only

Resetting
.mockClear()    // wipe .mock.calls and .mock.results, keep the implementation
.mockReset()    // wipe everything including the return value
.mockRestore()  // restore the original function (only works with vi.spyOn)
```\
""")

y += 70
create_node("Pytest Fixtures & Parametrization", parent_id=test_id, x=20, y=y, notes="""\
- **Fixtures:** reusable setup/teardown.
    - Code before `yield` = setup
    - Code after `yield` = teardown
- **Parametrization:** same test runs with multiple inputs.

Notes:
- Use `random.randint`, not `math.randint`.
- Your fixture returns a number; the test should use the fixture variable.

Example:

```python
import random
import pytest

@pytest.fixture
def rand_num():
    n = random.randint(1, 100)
    yield n

@pytest.mark.parametrize("a,b", [(1,2), (3,4), (4,5)])
def test_multiply(rand_num, a, b):
    result = rand_num * a * b
    assert result >= 0
```\
""")

# ── Infrastructure ─────────────────────────────────────────────────────────────
print("Creating leaf nodes: Infrastructure...")

y = 60
create_node("Static File Hosting (SSG + CDN)", parent_id=infr_id, x=20, y=y, notes="""\
- **SSG:** Build HTML ahead of time (e.g., Next.js SSG). Host on **S3 + CDN**.
- **Markdown pipeline:** Markdown → HTML during build = consistent docs formatting.
- **SSR vs SSG:**
    - **SSR**: server renders HTML on request (good for SEO, personalization)
    - **SSG**: prebuilt HTML (also great for SEO; no server needed at runtime)
- **Versioned docs:** Serve immutable URLs like `/v/X.Y.Z/...`
- **"Latest" routing:** `/latest` can redirect (CDN rule) or serve a small HTML redirect page.

Correction: "SSR irrelevant since static" is mostly true for docs. Docs typically use SSG. SSR is only needed if content is highly dynamic per request.\
""")

y += 70
create_node("SHA256, Hexdigest, Base62 Encoding", parent_id=infr_id, x=20, y=y, notes="""\
- 1 byte = 8 bits → can represent 0-255
- 1 ASCII char = 1 byte
- 1 int = 4 bytes = 32 bits → +- 2^32
- SHA256 can optimize by representing 1 byte as 2 chars
    - Spits out 64 chars as 32 bytes
- Hex = shows each byte as 16 symbols; 0-9, a-f
- Base62 = shows same data with 62 symbols: 0-9; a-z; A-Z\
""")

# ── 4. EDGES ───────────────────────────────────────────────────────────────────
print("Creating edges...")

# Solid edges (strongly builds on)
create_edge(lang_id,  conc_id)   # Language & Runtime → Concurrency & Parallelism
create_edge(async_id, web_id)    # Async I/O → Web Servers & Frameworks
create_edge(stor_id,  dist_id)   # Storage & Databases → Distributed Systems

# Dashed edges (enriches / contextually related)
create_edge(conc_id, dist_id, stroke_style="dashed")  # Concurrency → Distributed Systems
create_edge(web_id,  dist_id, stroke_style="dashed")  # Web Servers → Distributed Systems

print()
print("Done! Canvas populated:")
print("  8 root nodes, 3 sub-categories, 55 leaf nodes, 5 edges")
print("  Open http://localhost:5173 to view")

PYEOF
