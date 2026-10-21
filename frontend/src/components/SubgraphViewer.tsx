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

const NODE_COLORS: Record<string, { bg: string; border: string; badge: string }> = {
  claim: { bg: "#1e293b", border: "#f43f5e", badge: "KLAIM" },
  doctor: { bg: "#0f2942", border: "#38bdf8", badge: "DOKTER (DPJP)" },
  facility: { bg: "#11221f", border: "#10b981", badge: "FASKES" },
  patient: { bg: "#27173a", border: "#a855f7", badge: "PASIEN (HASH)" },
  diagnosis: { bg: "#2a1f0d", border: "#f59e0b", badge: "DIAGNOSIS" },
};

export const SubgraphViewer: React.FC<SubgraphViewerProps> = ({ nodes, edges }) => {
  const { flowNodes, flowEdges } = useMemo(() => {
    // Deterministic radial/layered layout around the central doctor/claim nodes
    const positionsByType: Record<string, { x: number; y: number }[]> = {
      patient: [
        { x: 30, y: 50 },
        { x: 30, y: 180 },
        { x: 30, y: 310 },
      ],
      doctor: [{ x: 300, y: 90 }],
      facility: [
        { x: 300, y: 250 },
        { x: 560, y: 260 },
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
        bg: "#1e293b",
        border: "#64748b",
        badge: t.toUpperCase(),
      };

      const isConflict = (n.label || "").toLowerCase().includes("konflik");

      return {
        id: n.id,
        position: pos,
        data: {
          label: (
            <div className="text-left">
              <div
                className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded inline-block mb-1"
                style={{
                  backgroundColor: isConflict ? "#dc2626" : styleCfg.border,
                  color: "#ffffff",
                }}
              >
                {isConflict ? "KONFLIK SPASIAL" : styleCfg.badge}
              </div>
              <div className="text-xs font-semibold text-slate-100 leading-snug">
                {n.label || n.id}
              </div>
            </div>
          ),
        },
        style: {
          background: styleCfg.bg,
          border: `2px solid ${isConflict ? "#ef4444" : styleCfg.border}`,
          borderRadius: "10px",
          padding: "8px 10px",
          width: 200,
          boxShadow: "0 8px 20px rgba(0,0,0,0.35)",
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
          stroke: isConflictEdge ? "#ef4444" : "#38bdf8",
          strokeWidth: isConflictEdge ? 2.5 : 1.8,
        },
        labelStyle: {
          fill: isConflictEdge ? "#fca5a5" : "#e2e8f0",
          fontWeight: 700,
          fontSize: 10,
        },
        labelBgStyle: {
          fill: "#0f172a",
          fillOpacity: 0.85,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isConflictEdge ? "#ef4444" : "#38bdf8",
        },
      };
    });

    return { flowNodes, flowEdges };
  }, [nodes, edges]);

  return (
    <div className="w-full h-[340px] rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1e293b" gap={18} />
        <Controls className="!bg-slate-900 !border-slate-700 !text-slate-200" />
      </ReactFlow>
    </div>
  );
};
