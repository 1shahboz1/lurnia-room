import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type PacketType =
  | "DNS_QUERY"
  | "DNS_RESPONSE"
  | "TCP_SYN"
  | "TCP_SYNACK"
  | "TCP_ACK"
  | "TLS_CLIENT_HELLO"
  | "TLS_SERVER_HELLO"
  | "TLS_CERT"
  | "HTTP_REQUEST"
  | "HTTP_RESPONSE"
  | "HTTP_ENCRYPTED";

export type PacketStatus = "normal" | "dropped" | "warning" | "cached" | "retransmit";

export interface PacketFrameProps {
  id?: string;
  type: PacketType;
  labelPrimary?: string;
  labelSecondary?: string;
  ttlSeconds?: number;
  sizeBytes?: number;
  meta?: { sizeBytes?: number; statusText?: string };
  encrypted?: boolean;
  status?: PacketStatus;
  selected?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  onChange?: (changes: Partial<{ id: string; type: PacketType; labelPrimary: string; labelSecondary: string; meta: { sizeBytes?: number; statusText?: string } }>) => void;
}

const groupOf = (type: PacketType) => {
  if (type.startsWith("DNS")) return "DNS";
  if (type.startsWith("TCP")) return "TCP";
  if (type.startsWith("TLS")) return "TLS";
  return "HTTP";
};

const stampEmoji: Record<string, string> = {
  DNS: "📡",
  TCP: "🧭",
  TLS: "🔒",
  HTTP: "🌐",
};

const outlineVarFor = (type: PacketType) => {
  const g = groupOf(type);
  if (g === "DNS") return "--packet-dns-ink";
  if (g === "TCP") return "--packet-tcp-ink";
  if (g === "TLS") return "--packet-tls-ink";
  return "--packet-http-ink";
};

const bodyGradientFor = (type: PacketType) => {
  const g = groupOf(type);
  if (g === "DNS") return `linear-gradient(135deg, hsl(var(--packet-dns-yellow) / 0.96), hsl(var(--packet-dns-green) / 0.96))`;
  if (g === "TCP") return `linear-gradient(135deg, hsl(var(--packet-tcp) / 0.96), hsl(var(--packet-tcp-600) / 0.96))`;
  if (g === "TLS") return `linear-gradient(135deg, hsl(var(--packet-tls) / 0.96), hsl(var(--packet-tls-600) / 0.96))`;
  return `linear-gradient(135deg, hsl(var(--packet-http) / 0.96), hsl(var(--packet-http-600) / 0.96))`;
};

// Editable token component used for inline editing of sub-values
function EditableToken({ label, value, onChange }: { label: string; value?: string | number; onChange: (v: string) => void }) {
  const [editing, setEditing] = React.useState(false);
  const [val, setVal] = React.useState(String(value ?? ""));
  const ref = React.useRef<HTMLInputElement | null>(null);
  React.useEffect(() => setVal(String(value ?? "")), [value]);
  React.useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  return (
    <div className="flex items-center gap-2 bg-white/85 px-3 py-1 rounded-md shadow-sm border border-slate-200 text-sm">
      <div className="text-slate-700/80 font-mono text-xs">{label} =</div>
      {!editing ? (
        <div className="font-medium truncate max-w-[220px] cursor-text" onClick={() => setEditing(true)}>{val || <span className="text-slate-400">—</span>}</div>
      ) : (
        <input ref={ref} className="bg-transparent outline-none text-sm font-medium" value={val} onChange={(e) => setVal(e.target.value)} onBlur={() => { setEditing(false); onChange(val); }} onKeyDown={(e) => { if (e.key === 'Enter') { setEditing(false); onChange(val); } }} />
      )}
    </div>
  );
}

export default function PacketFrame({ id, type, labelPrimary, labelSecondary, ttlSeconds = 300, sizeBytes = 15 * 1024, meta, encrypted = false, status = "normal", selected = false, className, style, onClick, onChange }: PacketFrameProps) {
  const g = groupOf(type);
  const stamp = stampEmoji[g];
  const outlineVar = outlineVarFor(type);
  const bg = bodyGradientFor(type);

  const fmtBytes = (n?: number) => (typeof n === "number" && isFinite(n) ? (n >= 1024 ? `${(n / 1024).toFixed(0)}KB` : `${n}B`) : `${n ?? ""}`);

  // local editable state
  const [idState, setIdState] = React.useState<string | undefined>(id);
  const [typeState, setTypeState] = React.useState<PacketType>(type);
  const [labelPrimaryState, setLabelPrimaryState] = React.useState<string | undefined>(labelPrimary);
  const [labelSecondaryState, setLabelSecondaryState] = React.useState<string | undefined>(labelSecondary);
  const [metaState, setMetaState] = React.useState<{ sizeBytes?: number; statusText?: string }>(() => ({ ...(meta?.sizeBytes ? { sizeBytes: meta.sizeBytes } : {}), ...(meta?.statusText ? { statusText: meta.statusText } : {}) }));

  const emitChange = (changes: Partial<{ id: string; type: PacketType; labelPrimary: string; labelSecondary: string; meta: { sizeBytes?: number; statusText?: string } }>) => {
    onChange?.(changes as any);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.98, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={cn("relative inline-block", className)}
      style={style}
    >
      <div
        role="button"
        onClick={onClick}
        className={"relative rounded-[12px] shadow-[0_10px_30px_rgba(8,15,30,0.08)] overflow-visible"}
        style={{
          width: 540,
          height: 405, // 4:3 (larger)
          border: `1.5px solid hsl(var(${outlineVar}))`,
          background: bg,
          WebkitBackdropFilter: encrypted ? "blur(2px)" : undefined,
        }}
      >
        {/* texture */}
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 6px)" }} />

        {/* top middle label (small rectangle) */}
        <div className="absolute left-1/2 -translate-x-1/2 top-2 z-30">
          <div className="px-4 py-2 rounded-lg bg-white/95 text-lg font-bold text-slate-900 shadow-md border border-slate-200" style={{ minWidth: 160 }}>
            Network Packet
          </div>
        </div>

        {/* Content layer */}
        <div className="absolute inset-0 z-10 px-6 pt-20 pb-6 flex flex-col justify-between">
          <div className="flex justify-center mb-3">
            <div className="flex gap-2 flex-wrap justify-center">
              <EditableToken label="id" value={idState} onChange={(v) => { setIdState(v); emitChange({ id: v }); }} />
              <EditableToken label="type" value={typeState} onChange={(v) => { setTypeState(v as PacketType); emitChange({ type: v as PacketType }); }} />
              <EditableToken label="labelPrimary" value={labelPrimaryState} onChange={(v) => { setLabelPrimaryState(v); emitChange({ labelPrimary: v }); }} />
              <EditableToken label="labelSecondary" value={labelSecondaryState} onChange={(v) => { setLabelSecondaryState(v); emitChange({ labelSecondary: v }); }} />
              <EditableToken label="sizeBytes" value={metaState.sizeBytes ?? ''} onChange={(v) => { const num = Number(v); setMetaState(s => ({ ...s, sizeBytes: isNaN(num) ? undefined : num })); emitChange({ meta: { ...(metaState), sizeBytes: isNaN(num) ? undefined : num } }); }} />
            </div>
          </div>

          <div className="h-2" />
        </div>

        {/* Encrypted overlay */}
        {encrypted && (
          <div className="absolute inset-0 z-30 pointer-events-none rounded-[12px]">
            <div className="absolute inset-0 bg-black/18 rounded-[12px] backdrop-blur-sm" />
            <div className="absolute left-4 top-4 flex items-center gap-2 text-white">
              <span className="text-sm">🔒</span>
              <span className="text-[12px] font-semibold">Encrypted</span>
            </div>
          </div>
        )}

        {/* Dropped tear */}
        {status === "dropped" && (
          <div className="absolute inset-0 z-40 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 75" preserveAspectRatio="none" className="w-full h-full">
              <path d="M10 40 C22 32, 30 20, 42 28 C54 36, 62 22, 78 28" stroke="rgba(0,0,0,0.7)" strokeWidth="0.8" fill="none" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>
    </motion.div>
  );
}