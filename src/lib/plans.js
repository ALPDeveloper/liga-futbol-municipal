export const MEMBERSHIP_PLANS = [
  {
    id: "Membresia Basica",
    label: "Basica",
    maxTeams: 12,
    maxActiveCompetitions: 1,
    features: {
      playoffs: false,
      scheduleGenerator: true,
      publicHighlights: true,
      adBanner: false
    }
  },
  {
    id: "Membresia Pro",
    label: "Pro",
    maxTeams: 24,
    maxActiveCompetitions: 3,
    features: {
      playoffs: true,
      scheduleGenerator: true,
      publicHighlights: true,
      adBanner: true
    }
  },
  {
    id: "Membresia Premium",
    label: "Premium",
    maxTeams: 60,
    maxActiveCompetitions: 8,
    features: {
      playoffs: true,
      scheduleGenerator: true,
      publicHighlights: true,
      adBanner: true
    }
  }
];

export function getPlanConfig(planId) {
  return MEMBERSHIP_PLANS.find((plan) => plan.id === planId) || MEMBERSHIP_PLANS[0];
}

export function getLeaguePlan(league) {
  return getPlanConfig(league?.plan || "Membresia Basica");
}

export function getPlanUsage(league) {
  const activeCompetitions = (league.competitions || []).filter((competition) => competition.status !== "archived").length;
  return {
    teams: league.teams?.length || 0,
    activeCompetitions
  };
}

export function formatPlanLimit(value) {
  return value >= 60 ? "amplio" : String(value);
}

export function canAddTeamByPlan(league) {
  const plan = getLeaguePlan(league);
  const usage = getPlanUsage(league);
  if (usage.teams >= plan.maxTeams) {
    return {
      allowed: false,
      message: `${league.name} tiene plan ${plan.label}. Limite de equipos: ${plan.maxTeams}.`
    };
  }
  return { allowed: true };
}

export function canAddCompetitionByPlan(league, payload = {}) {
  const plan = getLeaguePlan(league);
  const usage = getPlanUsage(league);
  const nextStatus = payload.status || "active";
  if (nextStatus !== "archived" && usage.activeCompetitions >= plan.maxActiveCompetitions) {
    return {
      allowed: false,
      message: `${league.name} tiene plan ${plan.label}. Limite de torneos activos: ${plan.maxActiveCompetitions}. Archiva un torneo o cambia de plan.`
    };
  }
  return { allowed: true };
}

export function canUsePlayoffsByPlan(league) {
  const plan = getLeaguePlan(league);
  if (!plan.features.playoffs) {
    return {
      allowed: false,
      message: `La liguilla esta disponible desde Membresia Pro. ${league.name} tiene plan ${plan.label}.`
    };
  }
  return { allowed: true };
}
