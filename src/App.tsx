import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

type Snapshot = {
  id: string;
  label: string;
  timestamp: string;
};

type AppStatus =
  | "STANDBY"
  | "CONNECTING"
  | "CONNECTED"
  | "INDEXING"
  | "REWINDING"
  | "ERROR";

const fade = { duration: 0.15 };
const slide = { duration: 0.2 };

const SLOTS = 4;
const isTauri = !!(window as any).__TAURI_INTERNALS__;
const mockDelay = (ms = 1200) =>
  !isTauri ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();

function App() {
  const [screen, setScreen] = useState<"setup" | "player">("setup");
  const [connectionString, setConnectionString] = useState("");
  const [dbName, setDbName] = useState("");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [status, setStatus] = useState<AppStatus>("STANDBY");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const snapCounter = useRef(0);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage((p) => {
      const max = Math.max(0, Math.ceil(snapshots.length / SLOTS) - 1);
      return p > max ? max : p;
    });
  }, [snapshots.length]);

  const showFlash = (msg: string, ms = 1200) => {
    setFlash(msg);
    setTimeout(() => setFlash(""), ms);
  };

  const handleConnect = async () => {
    setStatus("CONNECTING");
    setError("");
    try {
      if (!isTauri) {
        const mock = connectionString.split("/").pop()?.split("?")[0] || "mockdb";
        setDbName(mock);
        setStatus("CONNECTED");
        showFlash("SIGNAL ACQUIRED");
        setTimeout(() => setScreen("player"), 600);
        return;
      }

      const name: string = await invoke("connect_db", { connectionString });
      setDbName(name);

      try {
        const existing: string[] = await invoke("list_snapshots", {
          connectionString,
          dbName: name,
        });
        if (existing.length > 0) {
          setSnapshots(
            existing.map((snapName, i) => ({
              id: snapName,
              label: `MARK ${String(i + 1).padStart(3, "0")}`,
              timestamp: "recovered",
            }))
          );
          const maxNum = existing.reduce((max, n) => {
            const m = n.match(/_snap_(\d+)$/);
            return m ? Math.max(max, parseInt(m[1])) : max;
          }, 0);
          snapCounter.current = maxNum;
        }
      } catch {
        // non-fatal
      }

      setStatus("CONNECTED");
      showFlash("SIGNAL ACQUIRED");
      setTimeout(() => setScreen("player"), 600);
    } catch (e) {
      setStatus("ERROR");
      setError(String(e));
    }
  };

  const handleCreateSnapshot = async () => {
    setStatus("INDEXING");
    setError("");
    snapCounter.current += 1;
    const snapshotName = `${dbName}_snap_${snapCounter.current}`;
    try {
      if (isTauri) {
        await invoke("create_snapshot", {
          connectionString,
          dbName,
          snapshotName,
        });
      }
      await mockDelay();
      const timestamp = new Date().toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      setSnapshots((prev) => [
        {
          id: snapshotName,
          label: `MARK ${String(snapCounter.current).padStart(3, "0")}`,
          timestamp,
        },
        ...prev,
      ]);
      setPage(0);
      setStatus("CONNECTED");
      showFlash("SNAPSHOT SAVED");
    } catch (e) {
      snapCounter.current -= 1;
      setStatus("ERROR");
      setError(String(e));
    }
  };

  const handleRewind = async (snapshotId: string) => {
    setStatus("REWINDING");
    setError("");
    try {
      if (isTauri) {
        await invoke("zero_return", {
          connectionString,
          dbName,
          snapshotName: snapshotId,
        });
      }
      await mockDelay();
      setStatus("CONNECTED");
      showFlash("REWIND COMPLETE");
    } catch (e) {
      setStatus("ERROR");
      setError(String(e));
    }
  };

  const handleDelete = async (snapshotId: string) => {
    setError("");
    try {
      if (isTauri) {
        await invoke("delete_snapshot", {
          connectionString,
          snapshotName: snapshotId,
        });
      }
      setSnapshots((prev) => prev.filter((s) => s.id !== snapshotId));
      showFlash("SNAPSHOT ERASED");
    } catch (e) {
      setStatus("ERROR");
      setError(String(e));
    }
  };

  const handleDisconnect = () => {
    setScreen("setup");
    setDbName("");
    setSnapshots([]);
    setStatus("STANDBY");
    setError("");
    setFlash("");
    setPage(0);
    snapCounter.current = 0;
  };

  const vfdConnected = screen === "player";
  const displayStatus =
    status === "CONNECTED" && !vfdConnected ? "CONNECTING" : status;

  const vfdMainText = () => {
    if (flash) return flash;
    if (screen === "setup") {
      if (status === "CONNECTING") return "CONNECTING...";
      if (status === "ERROR") return "NO SIGNAL";
      return "AWAITING DB SIGNAL";
    }
    return dbName;
  };

  const vfdStatuses = [
    { label: "CONNECTED", when: status === "CONNECTED" },
    { label: "SAVING",    when: status === "INDEXING" },
    { label: "RWD", when: status === "REWINDING" },
    { label: "ERROR",     when: status === "ERROR" },
  ];

  const totalPages = Math.max(1, Math.ceil(snapshots.length / SLOTS));
  const pageSnaps = snapshots.slice(page * SLOTS, (page + 1) * SLOTS);
  const slots: (Snapshot | null)[] = Array.from(
    { length: SLOTS },
    (_, i) => pageSnaps[i] ?? null
  );

  return (
    <div className="vcr-shell">
      <div
        className="vcr-top-bar"
        onMouseDown={() => getCurrentWindow().startDragging()}
      >
        <div className="vcr-brand-group">
          <div className="vcr-indicator" data-status={displayStatus} />
          <span className="vcr-brand">db kind rewind</span>
        </div>
        <AnimatePresence>
          {screen === "player" && (
            <motion.button
              className="vcr-btn vcr-btn-eject"
              onClick={handleDisconnect}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={fade}
              onMouseDown={(e) => e.stopPropagation()}
            >
              ⏏ EJECT
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <div className="vcr-chassis">
        <div className="vfd-display">
          <div className="vfd-row">
            <span className={`vfd-label${status === "CONNECTED" || status === "INDEXING" || status === "REWINDING" ? " vfd-lit" : ""}`}>
              Database
            </span>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={vfdMainText()}
              className="vfd-text vfd-text-lg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={fade}
            >
              {vfdMainText()}
            </motion.div>
          </AnimatePresence>
          <div className="vfd-status vfd-status-row">
            {vfdStatuses.map((s) => (
              <span key={s.label} className={s.when ? "vfd-lit" : ""}>
                {s.label}
              </span>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {screen === "setup" ? (
            <motion.div
              key="setup-below"
              className="setup-below"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={slide}
            >
              <form
                className="setup-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleConnect();
                }}
              >
                <label className="vcr-label">connection string</label>
                <input
                  className="vcr-input"
                  type="text"
                  placeholder="postgresql://localhost:5432/mydb"
                  value={connectionString}
                  onChange={(e) => setConnectionString(e.target.value)}
                  spellCheck={false}
                  autoFocus
                />
                {error && <div className="vcr-error">{error}</div>}
                <button
                  className="vcr-btn vcr-btn-primary"
                  type="submit"
                  disabled={
                    !connectionString.trim() || status === "CONNECTING"
                  }
                >
                  {status === "CONNECTING" ? "CONNECTING..." : "▶ CONNECT"}
                </button>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="player-below"
              className="player-controls"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: 20 }}
              transition={slide}
            >
              {error && <div className="vcr-error">{error}</div>}

              <motion.button
                className="vcr-btn vcr-btn-index"
                onClick={handleCreateSnapshot}
                disabled={status === "INDEXING" || status === "REWINDING"}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05, duration: 0.2 }}
              >
                ● INDEX MARK
              </motion.button>

              <motion.div
                className="tape-section"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.2 }}
              >
                <div className="tape-head-row">
                  <div className="tape-side tape-side-left" />
                  <div className="tape-library-header">
                    <span className="tape-library-title">
                      ▪ tape library
                    </span>
                    <span className="tape-count">
                      {snapshots.length} saved
                    </span>
                  </div>
                  <div className="tape-side tape-side-right" />
                </div>

                <div className="tape-slots">
                  {slots.map((snap, i) => (
                    <div className="tape-row" key={`slot-${i}`}>
                      <div className="tape-side tape-side-left">
                        <button
                          className="vcr-btn vcr-btn-delete"
                          onClick={() => snap && handleDelete(snap.id)}
                        >
                          ✕
                        </button>
                      </div>
                      <div className="tape-row-info">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={snap?.id ?? `empty-${i}`}
                            className="tape-slot-content"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={fade}
                          >
                            {snap ? (
                              <>
                                <span className="snapshot-label">
                                  {snap.label}
                                </span>
                                <span className="snapshot-time">
                                  {snap.timestamp}
                                </span>
                              </>
                            ) : (
                              <span className="tape-slot-dash">
                                ── ── ──
                              </span>
                            )}
                          </motion.div>
                        </AnimatePresence>
                      </div>
                      <div className="tape-side tape-side-right">
                        <button
                          className="vcr-btn vcr-btn-rewind"
                          onClick={() => snap && handleRewind(snap.id)}
                        >
                          ◀◀ RWD
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="tape-foot-row">
                  <div className="tape-side tape-side-left" />
                  <div className="tape-library-cap" />
                  <div className="tape-side tape-side-right" />
                </div>
              </motion.div>

              <motion.div
                className="tape-nav"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, duration: 0.2 }}
              >
                <button
                  className="vcr-btn vcr-btn-nav"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  ▲
                </button>
                <span className="tape-page">
                  {page + 1}/{totalPages}
                </span>
                <button
                  className="vcr-btn vcr-btn-nav"
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                >
                  ▼
                </button>
              </motion.div>

            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default App;
