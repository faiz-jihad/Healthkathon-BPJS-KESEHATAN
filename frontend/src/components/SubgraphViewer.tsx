import React, { useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Node,
  Edge,
  NodeMouseHandler,
} from "@xyflow/react";
import { Info, X, Filter, Sparkles, Layers } from "lucide-react";
import { SubgraphNode, SubgraphEdge } from "../types/aura";

interface SubgraphViewerProps {
  nodes: SubgraphNode[];
  edges: SubgraphEdge[];
  onNodeSelect?: (node: SubgraphNode | null) => void;
}

const NODE_COLORS: Record<string, { bg: string; border: string; badgeBg: string; text: string; badge: string }> = {
  claim: { bg: "#ffffff", border: "#c95353", badgeBg: "#f9e8e8", text: "#a53e3e", badge: "BERKAS KLAIM" },
  doctor: { bg: "#ffffff", border: "#076641", badgeBg: "#e2eee5", text: "#076641", badge: "DOKTER (DPJP)" },
  facility: { bg: "#ffffff", border: "#098a58", badgeBg: "#e5f4ec", text: "#098a58", badge: "FASKES MITRA" },
  patient: { bg: "#ffffff", border: "#80729c", badgeBg: "#e8e3f3", text: "#5c4f78", badge: "PESERTA (ANONIM)" },
  diagnosis: { bg: "#ffffff", border: "#b2835b", badgeBg: "#f4e4d8", text: "#8c5b30", badge: "DIAGNOSIS (ICD-10)" },
};

export const SubgraphViewer: React.FC<SubgraphViewerProps> = ({ nodes, edges, onNodeSelect }) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [filterTypes, setFilterTypes] = useState<Record<string, boolean>>({
    claim: true,
    doctor: true,
    facility: true,
    patient: true,
    diagnosis: true,
  });

  const toggleTypeFilter = (t: string) => {
    setFilterTypes((prev) => ({
      ...prev,
      [t]: !prev[t],
    }));
  };

  const selectedNodeObj = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [selectedNodeId, nodes]);

  const connectedEdgesCount = useMemo(() => {
    if (!selectedNodeId) return 0;
    return edges.filter((e) => e.source === selectedNodeId || e.target === selectedNodeId).length;
  }, [selectedNodeId, edges]);

  const { flowNodes, flowEdges } = useMemo(() => {
    const filteredNodes = nodes.filter((n) => {
      const t = n.type || "entity";
      return filterTypes[t] !== false;
    });

    const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));

    const filteredEdges = edges.filter(
      (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
    );

    const positionsByType: Record<string, { x: number; y: number }[]> = {
      patient: [
        { x: 30, y: 50 },
        { x: 30, y: 180 },
        { x: 30, y: 310 },
      ],
      doctor: [{ x: 290, y: 90 }],
      facility: [
        { x: 290, y: 240 },
        { x: 560, y: 250 },
      ],
      claim: [{ x: 560, y: 90 }],
      diagnosis: [{ x: 800, y: 90 }],
    };

    const typeCounters: Record<string, number> = {};

    const formatRelation = (rel: string): string => {
      const lower = (rel || "").toLowerCase();
      if (lower.includes("conflict")) return "⚠ Konflik Jadwal Ganda";
      if (lower.includes("treated") || lower.includes("dpjp") || lower.includes("doctor")) return "Ditangani Oleh";
      if (lower.includes("diagnos") || lower.includes("icd")) return "Diagnosis Medis";
      if (lower.includes("admit") || lower.includes("facil")) return "Dirawat Di Faskes";
      if (lower.includes("refer")) return "Rujukan Faskes";
      if (lower.includes("belong") || lower.includes("patient")) return "Peserta Pemilik";
      return rel;
    };

    const flowNodes: Node[] = filteredNodes.map((n, idx) => {
      const t = n.type || "entity";
      const count = typeCounters[t] ?? 0;
      typeCounters[t] = count + 1;

      const presets = positionsByType[t];
      const pos =
        presets && presets[count]
          ? presets[count]
          : { x: 140 + (idx % 3) * 260, y: 60 + Math.floor(idx / 3) * 150 };

      const styleCfg = NODE_COLORS[t] || {
        bg: "#ffffff",
        border: "#838781",
        badgeBg: "#f5f6f2",
        text: "#1e241f",
        badge: t.toUpperCase(),
      };

      const isConflict = (n.label || "").toLowerCase().includes("konflik");
      const isSelected = n.id === selectedNodeId;

      return {
        id: n.id,
        position: pos,
        data: {
          label: (
            <div className="text-left select-none font-sans">
              <div
                className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full inline-block mb-1.5 border"
                style={{
                  backgroundColor: isConflict ? "#f9e8e8" : styleCfg.badgeBg,
                  color: isConflict ? "#a53e3e" : styleCfg.text,
                  borderColor: isConflict ? "#eec5c5" : styleCfg.border,
                }}
              >
                {isConflict ? "KONFLIK LOKASI TUNGGAL ⚠" : styleCfg.badge}
              </div>
              <div className="text-xs font-bold text-slate-800 leading-snug break-words">
                {n.label || n.id}
              </div>
            </div>
          ),
        },
        style: {
          background: isSelected ? "#f0fdf4" : styleCfg.bg,
          border: `${isSelected ? "3px" : "2px"} solid ${isSelected ? "#098a58" : isConflict ? "#c95353" : styleCfg.border}`,
          borderRadius: "16px",
          padding: "10px 14px",
          width: 220,
          cursor: "pointer",
          boxShadow: isSelected
            ? "0 0 0 3px rgba(9, 138, 88, 0.25), 0 4px 14px rgba(0, 0, 0, 0.1)"
            : isConflict
            ? "0 4px 14px rgba(201, 83, 83, 0.16)"
            : "0 2px 10px rgba(9, 138, 88, 0.08)",
        },
      };
    });

    const flowEdges: Edge[] = filteredEdges.map((e, idx) => {
      const isConflictEdge = (e.relation || "").toLowerCase().includes("conflict");
      const isHighlighted =
        selectedNodeId && (e.source === selectedNodeId || e.target === selectedNodeId);

      return {
        id: `e-${idx}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        label: formatRelation(e.relation),
        animated: isConflictEdge || Boolean(isHighlighted),
        style: {
          stroke: isHighlighted
            ? "#098a58"
            : isConflictEdge
            ? "#c95353"
            : "#838781",
          strokeWidth: isHighlighted ? 3 : isConflictEdge ? 2.5 : 1.8,
        },
        labelStyle: {
          fill: isConflictEdge ? "#a53e3e" : "#076641",
          fontWeight: 700,
          fontSize: 10,
          fontFamily: "Manrope, sans-serif",
        },
        labelBgStyle: {
          fill: "#ffffff",
          fillOpacity: 0.95,
          stroke: isConflictEdge ? "#f4c6c6" : "#cbe3d7",
          strokeWidth: 1,
          rx: 6,
          ry: 6,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isHighlighted ? "#098a58" : isConflictEdge ? "#c95353" : "#838781",
        },
      };
    });

    return { flowNodes, flowEdges };
  }, [nodes, edges, filterTypes, selectedNodeId]);

  const onNodeClick: NodeMouseHandler = (_, node) => {
    const nextId = node.id === selectedNodeId ? null : node.id;
    setSelectedNodeId(nextId);
    if (onNodeSelect) {
      const selectedObj = nextId ? nodes.find((n) => n.id === nextId) || null : null;
      onNodeSelect(selectedObj);
    }
  };

  return (
    <div className="w-full rounded-2xl overflow-hidden border border-[#edf0e9] bg-[#f5f6f2] relative shadow-inner">
      {/* Top Filter Bar */}
      <div className="bg-white/90 backdrop-blur-sm px-3 py-2 border-b border-[#edf0e9] flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-1.5 font-bold text-slate-700">
          <Filter size={14} className="text-[#098a58]" />
          <span>Filter Simpul Relasi:</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {Object.keys(NODE_COLORS).map((t) => {
            const active = filterTypes[t] !== false;
            const cfg = NODE_COLORS[t];
            return (
              <button
                key={t}
                onClick={() => toggleTypeFilter(t)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-all ${
                  active
                    ? "bg-slate-100 border-slate-300 text-slate-800"
                    : "bg-white border-dashed border-slate-200 text-slate-400 line-through"
                }`}
                style={{
                  color: active ? cfg.text : "#9ca3af",
                  borderColor: active ? cfg.border : "#e5e7eb",
                }}
              >
                {cfg.badge}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Flow Canvas */}
      <div className="w-full h-[420px] relative">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          onNodeClick={onNodeClick}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#d8ded2" gap={20} size={1.2} />
          <Controls className="!bg-white !border-[#edf0e9] !text-[#1e241f] !shadow-sm !rounded-xl" />
        </ReactFlow>

        {/* Selected Node Inspection Card */}
        {selectedNodeObj && (
          <div className="absolute top-3 right-3 bg-white border border-[#cbe3d7] rounded-xl p-3 shadow-lg max-w-[260px] z-10 text-xs animate-pop-in card-interactive">
            <div className="flex items-center justify-between mb-1.5 border-b pb-1">
              <span className="font-bold text-[#076641] flex items-center gap-1">
                <Sparkles size={12} />
                Detail Simpul Terpilih
              </span>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
              >
                <X size={13} />
              </button>
            </div>
            <div className="font-mono font-bold text-slate-800 text-[11px] break-all">
              {selectedNodeObj.id}
            </div>
            <div className="text-slate-600 text-[11px] mt-1">
              {selectedNodeObj.label || "Tidak ada metadata tambahan"}
            </div>
            <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
              <span>Tipe: <strong>{selectedNodeObj.type?.toUpperCase()}</strong></span>
              <span><strong>{connectedEdgesCount}</strong> Relasi Terhubung</span>
            </div>
          </div>
        )}

        {/* Bottom Legend */}
        <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-sm border border-[#edf0e9] rounded-xl px-3 py-1.5 shadow-sm text-[11px] flex items-center gap-3 text-[#1e241f] font-sans">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#098a58]"></span> Faskes Mitra
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#076641]"></span> Dokter DPJP
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#c95353]"></span> Berkas Klaim
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#80729c]"></span> Peserta BPJS
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#b2835b]"></span> Diagnosis Medis
          </span>
        </div>
      </div>
    </div>
  );
};
