import React, { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Node,
  Edge,
} from "@xyflow/react";
import { SubgraphNode, SubgraphEdge } from "../types/aura";

interface SubgraphViewerProps {
  nodes: SubgraphNode[];
  edges: SubgraphEdge[];
}

const NODE_COLORS: Record<string, { bg: string; border: string; badgeBg: string; text: string; badge: string }> = {
  claim: { bg: "#ffffff", border: "#c95353", badgeBg: "#f9e8e8", text: "#a53e3e", badge: "KLAIM" },
  doctor: { bg: "#ffffff", border: "#076641", badgeBg: "#e2eee5", text: "#076641", badge: "DOKTER (DPJP)" },
  facility: { bg: "#ffffff", border: "#098a58", badgeBg: "#e5f4ec", text: "#098a58", badge: "FASKES" },
  patient: { bg: "#ffffff", border: "#80729c", badgeBg: "#e8e3f3", text: "#5c4f78", badge: "PASIEN (HASH)" },
  diagnosis: { bg: "#ffffff", border: "#b2835b", badgeBg: "#f4e4d8", text: "#8c5b30", badge: "DIAGNOSIS" },
};

export const SubgraphViewer: React.FC<SubgraphViewerProps> = ({ nodes, edges }) => {
  const { flowNodes, flowEdges } = useMemo(() => {
    // Radial / hierarchical positioning
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

    const flowNodes: Node[] = nodes.map((n, idx) => {
      const t = n.type || "entity";
      const count = typeCounters[t] ?? 0;
      typeCounters[t] = count + 1;

      const presets = positionsByType[t];
      const pos =
        presets && presets[count]
          ? presets[count]
          : { x: 140 + (idx % 3) * 250, y: 60 + Math.floor(idx / 3) * 140 };

      const styleCfg = NODE_COLORS[t] || {
        bg: "#ffffff",
        border: "#838781",
        badgeBg: "#f5f6f2",
        text: "#1e241f",
        badge: t.toUpperCase(),
      };

      const isConflict = (n.label || "").toLowerCase().includes("konflik");

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
                {isConflict ? "KONFLIK SPASIAL" : styleCfg.badge}
              </div>
              <div className="text-xs font-bold text-slate-800 leading-snug break-words">
                {n.label || n.id}
              </div>
            </div>
          ),
        },
        style: {
          background: styleCfg.bg,
          border: `2px solid ${isConflict ? "#c95353" : styleCfg.border}`,
          borderRadius: "16px",
          padding: "10px 14px",
          width: 210,
          boxShadow: isConflict
            ? "0 4px 14px rgba(201, 83, 83, 0.16)"
            : "0 2px 10px rgba(9, 138, 88, 0.08)",
        },
      };
    });

    const flowEdges: Edge[] = edges.map((e, idx) => {
      const isConflictEdge = e.relation.includes("conflict");
      return {
        id: `e-${idx}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        label: e.relation,
        animated: true,
        style: {
          stroke: isConflictEdge ? "#c95353" : "#098a58",
          strokeWidth: isConflictEdge ? 2.5 : 2,
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
          color: isConflictEdge ? "#c95353" : "#098a58",
        },
      };
    });

    return { flowNodes, flowEdges };
  }, [nodes, edges]);

  return (
    <div className="w-full h-[360px] rounded-2xl overflow-hidden border border-[#edf0e9] bg-[#f5f6f2] relative shadow-inner">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#d8ded2" gap={20} size={1.2} />
        <Controls className="!bg-white !border-[#edf0e9] !text-[#1e241f] !shadow-sm !rounded-xl" />
      </ReactFlow>

      {/* Floating Legend */}
      <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-sm border border-[#edf0e9] rounded-xl px-3 py-1.5 shadow-sm text-[11px] flex items-center gap-3 text-[#1e241f] font-sans">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#098a58]"></span> Faskes
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#076641]"></span> Dokter
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#c95353]"></span> Klaim
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#80729c]"></span> Pasien
        </span>
      </div>
    </div>
  );
};
