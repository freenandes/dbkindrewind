import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

type Snapshot = {
  id: string;
  label: string;
  timestamp: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;

  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (isToday) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  return `${pad(d.getFullYear() % 100)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

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
const MAX_SNAPSHOTS = 999;
const isTauri = !!(window as any).__TAURI_INTERNALS__;
const mockDelay = (ms = 1200) =>
  !isTauri ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();

function App() {
  const [screen, setScreen] = useState<"setup" | "player">("setup");
  const [connectionString, setConnectionString] = useState("");
  const [dbName, setDbName] = useState("");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [status, setStatus] = useState<AppStatus>("STANDBY");
  // Simulate other statuses with:
  //
  // const [status, setStatus] = useState<AppStatus>("ERROR");
  //
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
              label: `S${String(i + 1).padStart(3, "0")}`,
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
    if (snapshots.length >= MAX_SNAPSHOTS) {
      setStatus("ERROR");
      setError(`Maximum of ${MAX_SNAPSHOTS} snapshots reached`);
      return;
    }
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
      const timestamp = new Date().toISOString();
      setSnapshots((prev) => [
        {
          id: snapshotName,
          label: `S${String(snapCounter.current).padStart(3, "0")}`,
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

  const statusIcons: Record<string, React.ReactNode> = {
    SAVING: (
      <svg viewBox="0 0 16 16">
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M8 3a5 5 0 1 1 0 10A5 5 0 0 1 8 3m0 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4" />
      </svg>
    ),
    RWD: (
      <svg viewBox="0 0 16 16">
        <path
          fill="currentColor"
          d="M9 12 5 8l4-4zM13 12 9 8l4-4zM5 11.5H3v-7h2z"/>
      </svg>
    ),
    ERROR: (
      <svg viewBox="0 0 16 16">
        <path
          fill="currentColor"
          d="M8 5.5 9 2v4l3-4.5L11 7l4-1.5-4 4.5 3 1-4 1v2.5L8.5 11 11 8 9 9l.5-2.5-1.5 2L7 7l.5 3H5l2 1-.5 2 1-1 1 1L5 15l.5-3h-3L5 11 .5 8.5l4 .5-3-5L6 7 4.5 1z"/>
      </svg>
    ),
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
{}
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
          <div className="vfd-status-row">
            {vfdStatuses.map((s) => (
              <span key={s.label} className={s.when ? "vfd-status vfd-lit" : "vfd-status"}>
                {statusIcons[s.label]}
                {s.label}
              </span>
            ))}
          </div>
        </div>
        <div className="vcr-vanity">
          <span>Postgres</span> <span>Technology</span>
        </div>
      </div>
      <div className="vcr-chassis">
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
                <label className="vcr-label">Connection URL</label>
                <input
                  className="vcr-input"
                  type="text"
                  placeholder="Paste URL here..."
                  value={connectionString}
                  onChange={(e) => setConnectionString(e.target.value)}
                  spellCheck={false}
                  autoFocus
                />
                {error && <div className="vcr-error">{error}</div>}
                <div className="vcr-btn-container">
                  <button
                    className="vcr-btn vcr-btn-primary"
                    type="submit"
                    disabled={
                      !connectionString.trim() || status === "CONNECTING"
                    }
                  >
                    {status === "CONNECTING" ? "CONNECTING..." : (
                      <>
                        {" "}CONNECT
                        <svg viewBox="0 0 16 16">
                          <path
                            fill="currentColor"
                            d="m4 3 10 5-10 5z" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
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

              <motion.div
                className="btn-row"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05, duration: 0.2 }} >
                  <motion.div
                    className="vcr-btn-container vcr-btn-eject" >
                      <button
                        className="vcr-btn vcr-btn-red"
                        onClick={handleDisconnect}
                        onMouseDown={(e) => e.stopPropagation()} >
                          <svg viewBox="0 0 16 16">
                            <path
                              fill="currentColor"
                              d="M12.5 12h-9v-2h9zM13 8H3l5-5z" />
                          </svg>
                      </button>
                  </motion.div>
                  <motion.div
                    className="vcr-btn-container vcr-btn-quicksave">
                      <button
                        className="vcr-btn vcr-btn-primary"
                        onClick={handleCreateSnapshot}
                        disabled={status === "INDEXING" || status === "REWINDING" || snapshots.length >= MAX_SNAPSHOTS} >
                          {/* <svg viewBox="0 0 16 16">
                            <path
                              fill="currentColor"
                              fillRule="evenodd"
                              clipRule="evenodd"
                              d="M8 3a5 5 0 1 1 0 10A5 5 0 0 1 8 3m0 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4" />
                          </svg> */}
                          Save Snapshot
                      </button>
                  </motion.div>
              </motion.div>

              <motion.div
                className="tape-section"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.2 }}>
                  <div className="tape-head-row">
                    <div className="tape-side tape-side-left" />
                    <div className="tape-library-header">
                      {/* <span className="tape-var tape-count">
                        {snapshots.length}22
                      </span>
                      <span className="vfd-status vfd-lit">
                        Snap(s)
                      </span> */}
                      <span className="tape-var tape-pages">
                        PAG {page + 1}/{totalPages}
                      </span>
                    </div>
                    <div className="tape-side tape-side-right" />
                  </div>
                  <div className="tape-slots">
                    {slots.map((snap, i) => (
                      <div className="tape-row" key={`slot-${i}`}>
                        <div className="tape-side tape-side-left">
                          <div className="vcr-btn-container">
                            <button
                              className="vcr-btn vcr-btn-delete vcr-btn-red"
                              onClick={() => snap && handleDelete(snap.id)}
                            >
                              DEL
                            </button>
                          </div>
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
                                  <span className="snapshot-label tape-var">
                                    {snap.label}&nbsp;
                                  </span>
                                  <span className="snapshot-time tape-var">
                                    {formatTimestamp(snap.timestamp)}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="tape-slot-dash tape-var">
                                    ----&nbsp;
                                  </span>
                                  <span className="tape-slot-dash tape-var">
                                    --&nbsp;--&nbsp;--
                                  </span>
                                </>
                              )}
                            </motion.div>
                          </AnimatePresence>
                        </div>
                        <div className="tape-side tape-side-right">
                          <div className="vcr-btn-container">
                            <button
                              className="vcr-btn vcr-btn-rewind"
                              onClick={() => snap && handleRewind(snap.id)}
                            >
                              <svg viewBox="0 0 16 16">
                                <path
                                  fill="currentColor"
                                  d="M9 12 5 8l4-4zM13 12 9 8l4-4zM5 11.5H3v-7h2z"/>
                              </svg>
                              RWD
                            </button>
                          </div>
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
                <div className="vcr-btn-container">
                  <button
                    className="vcr-btn vcr-btn-nav prev"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    <svg viewBox="0 0 16 16">
                      <path
                        fill="currentColor"
                        d="m4 3 10 5-10 5z" />
                    </svg>
                  </button>
                </div>
                <div className="vcr-btn-container">
                  <button
                    className="vcr-btn vcr-btn-nav next"
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                  >
                    <svg viewBox="0 0 16 16">
                      <path
                        fill="currentColor"
                        d="m4 3 10 5-10 5z" />
                    </svg>
                  </button>
                </div>
              </motion.div>

            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default App;
