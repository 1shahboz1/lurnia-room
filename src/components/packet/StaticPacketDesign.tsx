import * as React from "react";

export interface StaticPacketDesignProps {
  id?: string;
  labelPrimary?: string;
  labelSecondary?: string;
  sizeBytes?: number;
  encrypted?: boolean;
  dropped?: boolean;
}

export default function StaticPacketDesign({
  id = "pkt-2",
  labelPrimary = "HTTP 200",
  labelSecondary = "ETag: etag-4af2b1",
  sizeBytes = 14320,
  encrypted = false,
  dropped = false,
}: StaticPacketDesignProps) {
  return (
    <div className={`vr-packet ${encrypted ? 'encrypted' : ''} ${dropped ? 'dropped' : ''}`}>      
      <style>{`
        .vr-packet { width: 720px; height: 540px; border-radius: 16px; position: relative; overflow: visible; border:2px solid hsl(var(--packet-http)); background: linear-gradient(160deg, hsl(var(--packet-http) / 0.98), hsl(var(--packet-http-600, var(--packet-http)) / 0.9)); box-shadow: 0 18px 40px rgba(2,6,23,0.08), inset 0 -6px 18px rgba(255,255,255,0.18); }
        .vr-packet::before { content:""; position:absolute; inset:0; pointer-events:none; background-image:repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 6px); border-radius:inherit; }
        .vr-packet .label-pill { position:absolute; left:50%; transform:translateX(-50%); top:14px; background:rgba(255,255,255,0.95); padding:12px 18px; border-radius:10px; font-weight:700; box-shadow:0 6px 16px rgba(2,6,23,0.06); border:1px solid rgba(15,23,42,0.06); z-index:3; }
        .vr-packet .flap { position:absolute; left:50%; transform:translateX(-50%); top:38px; width:74%; height:86px; pointer-events:none; z-index:2; }
        .vr-packet .face { position:absolute; inset:110px 22px 22px 22px; display:flex; flex-direction:column; justify-content:space-between; z-index:1; }
        .vr-packet .head { display:flex; align-items:flex-start; gap:18px; }
        .vr-packet .title { font-size:20px; font-weight:700; }
        .vr-packet .subtitle { font-size:14px; color:rgba(15,23,42,0.7); margin-top:6px; }
        .vr-packet .tokens { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
        .vr-packet .token { background:rgba(255,255,255,0.9); padding:8px 12px; border-radius:10px; border:1px solid rgba(15,23,42,0.06); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", monospace; font-size:13px; min-width:80px; }
        .vr-packet .key { font-weight:600; color:rgba(2,6,23,0.6); font-size:12px; }
        .vr-packet .val { margin-left:8px; color:#061028; }
        .vr-packet.encrypted::after { content:""; position:absolute; inset:0; border-radius:inherit; background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.18)); backdrop-filter: blur(3px); }
        .vr-packet .shield { position:absolute; left:18px; top:18px; background:rgba(255,255,255,0.06); padding:6px 8px; border-radius:8px; color:white; font-weight:700; display:flex; gap:8px; align-items:center; z-index:4; }
        .vr-packet.dropped .tear { display:block; }
        .vr-packet .tear { position:absolute; right:18px; bottom:18px; width:120px; height:90px; opacity:0.95; display:none; }
        @media (max-width:900px) { .vr-packet { width:520px; height:390px; } }
        @media (max-width:540px) { .vr-packet { width:360px; height:270px; } .vr-packet .label-pill{ padding:8px 12px; font-size:14px; } }
      `}</style>

      <div className="label-pill">Network Packet</div>

      <svg className="flap" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="vr-flapGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.06)" />
          </linearGradient>
        </defs>
        <polygon points="0,60 50,6 100,60" fill="url(#vr-flapGrad)" stroke="rgba(0,0,0,0.06)" strokeWidth="0.6" />
      </svg>

      {encrypted && (
        <div className="shield">🔒 Encrypted</div>
      )}

      <div className="face">
        <div>
          <div className="head">
            <div className="title">{labelPrimary || '\u00A0'}</div>
            <div style={{ flex: 1 }} />
          </div>
          <div className="subtitle">{labelSecondary || '\u00A0'}</div>
        </div>

        <div className="tokens">
          <div className="token"><span className="key">id</span><span className="val">{id}</span></div>
          <div className="token"><span className="key">type</span><span className="val">HTTP_RESPONSE</span></div>
          <div className="token"><span className="key">labelPrimary</span><span className="val">{labelPrimary}</span></div>
          <div className="token"><span className="key">labelSecondary</span><span className="val">{labelSecondary}</span></div>
          <div className="token"><span className="key">sizeBytes</span><span className="val">{sizeBytes}</span></div>
        </div>
      </div>

      <svg className="tear" viewBox="0 0 120 90" preserveAspectRatio="none">
        <path d="M4 60 C18 48, 28 30, 46 36 C64 42, 76 28, 98 34 L110 40 L102 72 L86 78 L70 90 L40 84 L28 74 L14 68 Z" fill="rgba(0,0,0,0.06)" />
      </svg>
    </div>
  );
}