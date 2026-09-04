import type { RequestRecord, Flow, FlowStep, FlowMatch, MediumSession, FunnelResult, MediumStats, Medium } from "./types.js";

function matchPath(recordPath: string, pattern: string): boolean {
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1);      // "/product/*" -> "/product/"
    return recordPath.startsWith(prefix);
  }
  return recordPath.split("?")[0] === pattern; // exact, query stripped
}

export function matchFlow(flow: Flow, records: RequestRecord[]): FlowMatch {
    let flowStep = 0; 

    for (const record of records) { 
        if (flowStep >= flow.steps.length) break;
        const methodMatch = !flow.steps[flowStep].method || flow.steps[flowStep].method?.toUpperCase() === record.method.toUpperCase();
        const pathMatch = matchPath(record.path, flow.steps[flowStep].path)
        
        if (methodMatch && pathMatch) { 
            flowStep += 1;
        }
    }

    const flowMatch: FlowMatch = { 
        flow: flow.name,
        reached: flowStep, 
        completed: flowStep === flow.steps.length
    }

    return flowMatch;
}

function createEmptyStats(flow: Flow): MediumStats {
    return {
        total: 0,
        completed: 0,
        completionRate: 0,
        reachedPerStep: new Array(flow.steps.length).fill(0),
    };
}

function findParityGapStep(flow: Flow, human: MediumStats, agent: MediumStats): number | null {
    if (human.total === 0 || agent.total === 0) return null;

    let bestStep: number | null = null;
    let bestGap = -Infinity;

    for (let step = 0; step < flow.steps.length; step += 1) {
        const humanRate = human.reachedPerStep[step] / human.total;
        const agentRate = agent.reachedPerStep[step] / agent.total;
        const gap = humanRate - agentRate;

        if (gap > bestGap) {
            bestGap = gap;
            bestStep = step;
        }
    }

    return bestGap > 0 ? bestStep : null;
}

export function computeFunnel(flow: Flow, sessions: MediumSession[]): FunnelResult {
    const stats: Record<Medium, MediumStats> = { 
        human: createEmptyStats(flow), 
        agent: createEmptyStats(flow)
    };

    for (const session of sessions) { 
        const {reached, completed } = matchFlow(flow, session.records);
        
        const mediumStat = stats[session.medium];

        mediumStat.total += 1;
        if (completed) mediumStat.completed += 1;
        for (let step = 0; step < reached; step++) {
            mediumStat.reachedPerStep[step] += 1;
        }
        mediumStat.completionRate = mediumStat.total > 0 ? mediumStat.completed / mediumStat.total : 0;
    } 



    const funnelResult: FunnelResult = {
        flow: flow.name, 
        steps: flow.steps.length, 
        agent: stats["agent"],
        human: stats["human"],
        parityGapStep: findParityGapStep(flow, stats["human"], stats["agent"])
    };

    return funnelResult;
}