import React from "react";

export default function CurryStaticPacket(): JSX.Element {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-2xl font-semibold text-slate-900">Network Packet</div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span className="uppercase tracking-wide">Packet ID</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-50 border border-slate-100 text-sm font-mono text-slate-700 shadow-sm">pkt-2</span>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <div className="p-2 rounded-md bg-slate-50 border border-slate-100 text-xs flex items-center justify-between">
            <div className="text-xs text-slate-500">Type</div>
            <div className="font-medium ml-2">HTTP_REQUEST</div>
          </div>
          <div className="p-2 rounded-md bg-slate-50 border border-slate-100 text-xs flex items-center justify-between">
            <div className="text-xs text-slate-500">Encrypted</div>
            <div className="font-medium ml-2">Yes</div>
          </div>
          <div className="p-2 rounded-md bg-slate-50 border border-slate-100 text-xs flex items-center justify-between">
            <div className="text-xs text-slate-500">Protocol</div>
            <div className="font-medium ml-2">TCP</div>
          </div>
          <div className="p-2 rounded-md bg-slate-50 border border-slate-100 text-xs flex items-center justify-between">
            <div className="text-xs text-slate-500">Flags</div>
            <div className="font-medium ml-2">SYN,ACK</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-md border border-slate-100 bg-white p-3 overflow-auto h-full">
            <div className="text-xs text-slate-500 mb-2">Fields</div>
            <div className="text-xs text-slate-700 space-y-2">
              <div><span className="text-slate-500">method:</span> <span className="font-medium">GET</span></div>
              <div><span className="text-slate-500">path:</span> <span className="font-medium">/</span></div>
              <div><span className="text-slate-500">host:</span> <span className="font-medium">example.com</span></div>
              <div><span className="text-slate-500">user-agent:</span> <span className="font-medium">demo-client/1.0</span></div>
              <div><span className="text-slate-500">src_ip:</span> <span className="font-medium">192.168.1.10</span></div>
              <div><span className="text-slate-500">dst_ip:</span> <span className="font-medium">93.184.216.34</span></div>
              <div><span className="text-slate-500">src_port:</span> <span className="font-medium">52344</span></div>
              <div><span className="text-slate-500">dst_port:</span> <span className="font-medium">80</span></div>
            </div>
          </div>

          <div className="rounded-md border border-slate-100 bg-white p-3 shadow-sm flex flex-col min-h-[220px] h-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-medium">HTTP GET</span>
                <div className="text-sm font-medium">Host: example.com</div>
              </div>
              <div className="text-xs text-slate-400">&nbsp;</div>
            </div>

            <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-700 flex-1">
              <div className="text-slate-700">
                <div className="flex items-center gap-3">
                  <div className="text-sm font-medium">&nbsp;</div>
                </div>
              </div>

              <div className="mt-auto grid grid-cols-3 gap-2 text-[11px] text-slate-500">
                <div className="px-2 py-1 rounded-md bg-slate-50 border border-slate-100">TTL: <span className="font-medium ml-1">300s</span></div>
                <div className="px-2 py-1 rounded-md bg-slate-50 border border-slate-100">Size: <span className="font-medium ml-1">15.0 KB</span></div>
                <div className="px-2 py-1 rounded-md bg-slate-50 border border-slate-100">Status: <span className="font-medium ml-1">200</span></div>
              </div>

            </div>

          </div>
        </div>
      </div>

    </div>
  );
}