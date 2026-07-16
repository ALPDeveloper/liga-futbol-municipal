import { DEFAULT_IDENTITY } from "./defaultIdentity.js";

export const seedData = {
  currentLeagueId: "liga-centro",
  leagues: [
    {
      id: "liga-centro",
      name: "Liga Municipal Tingüindín",
      city: "Tingüindín, Michoacán",
      season: "Apertura 2026",
      currentCompetitionId: "comp-liga-tinguindin-2026",
      competitions: [
        {
          id: "comp-liga-tinguindin-2026",
          name: "Torneo de Liga",
          type: "liga",
          season: "Apertura 2026",
          status: "active",
          startsAt: "2026-06-08",
          endsAt: ""
        },
        {
          id: "comp-copa-tinguindin-2026",
          name: "Copa Tingüindín",
          type: "copa",
          season: "2026",
          status: "active",
          startsAt: "",
          endsAt: ""
        },
        {
          id: "comp-barrios-tinguindin-2026",
          name: "Torneo de Barrios",
          type: "barrios",
          season: "2026",
          status: "active",
          startsAt: "",
          endsAt: ""
        }
      ],
      status: "active",
      plan: "Sin limite",
      ownerEmail: "admin.tinguindin@demo.com",
      renewalDate: "2026-07-15",
      adBanner: "Espacio disponible para patrocinador local",
      identity: {
        nickname: "Pueblo de las 3 campanas",
        activities: "Aguacate, pan",
        publicIntro: "Liga municipal con identidad local de Tingüindín: futbol, comunidad, jornadas, resultados y estadisticas abiertas para todos.",
        primaryColor: "#0f6b4f",
        accentColor: "#f6c453",
        secondaryColor: "#8b3f1f"
      },
      highlights: [
        "Union Municipal remonto con gol al minuto 84.",
        "Halcones FC mantiene la mejor defensa del torneo.",
        "Jornada 4 se disputara en la Unidad Deportiva Norte."
      ],
      announcements: [],
      teams: [
        { id: "halcones", name: "Halcones FC", coach: "Marco Ruiz", colors: "#136f63" },
        { id: "union", name: "Union Municipal", coach: "Luis Mora", colors: "#d9480f" },
        { id: "atletico", name: "Atletico Barrio", coach: "Rafael Peña", colors: "#31572c" },
        { id: "deportivo", name: "Deportivo Norte", coach: "Omar Rivas", colors: "#1d4ed8" },
        { id: "real", name: "Real Alameda", coach: "Carlos Vega", colors: "#7c2d12" }
      ],
      players: [
        { id: "p1", teamId: "halcones", name: "Diego Salas", number: 9, position: "Delantero" },
        { id: "p2", teamId: "halcones", name: "Tomas Luna", number: 5, position: "Defensa" },
        { id: "p3", teamId: "union", name: "Nestor Cano", number: 10, position: "Medio" },
        { id: "p4", teamId: "union", name: "Ivan Rey", number: 7, position: "Delantero" },
        { id: "p5", teamId: "atletico", name: "Mario Gil", number: 11, position: "Delantero" },
        { id: "p6", teamId: "deportivo", name: "Hugo Vidal", number: 8, position: "Medio" },
        { id: "p7", teamId: "real", name: "Alan Soto", number: 4, position: "Defensa" },
        { id: "p8", teamId: "real", name: "Leo Mena", number: 9, position: "Delantero" }
      ],
      matches: [
        {
          id: "m1",
          competitionId: "comp-liga-tinguindin-2026",
          round: 1,
          date: "2026-06-08",
          time: "18:00",
          venue: "Cancha Municipal 1",
          homeTeamId: "halcones",
          awayTeamId: "union",
          status: "finished",
          homeGoals: 2,
          awayGoals: 1,
          events: [
            { type: "goal", playerId: "p1", teamId: "halcones", minute: 18 },
            { type: "yellow", playerId: "p2", teamId: "halcones", minute: 31 },
            { type: "goal", playerId: "p3", teamId: "union", minute: 52 },
            { type: "goal", playerId: "p1", teamId: "halcones", minute: 77 },
            { type: "yellow", playerId: "p4", teamId: "union", minute: 80 }
          ]
        },
        {
          id: "m2",
          competitionId: "comp-liga-tinguindin-2026",
          round: 1,
          date: "2026-06-09",
          time: "19:30",
          venue: "Unidad Deportiva Norte",
          homeTeamId: "atletico",
          awayTeamId: "deportivo",
          status: "finished",
          homeGoals: 0,
          awayGoals: 0,
          events: [
            { type: "yellow", playerId: "p5", teamId: "atletico", minute: 40 },
            { type: "red", playerId: "p6", teamId: "deportivo", minute: 69, suspensionMatches: 1, reason: "Juego brusco grave" }
          ]
        },
        {
          id: "m3",
          competitionId: "comp-liga-tinguindin-2026",
          round: 2,
          date: "2026-06-15",
          time: "18:30",
          venue: "Cancha Municipal 2",
          homeTeamId: "real",
          awayTeamId: "halcones",
          status: "scheduled",
          homeGoals: null,
          awayGoals: null,
          events: []
        },
        {
          id: "m4",
          competitionId: "comp-liga-tinguindin-2026",
          round: 2,
          date: "2026-06-16",
          time: "20:00",
          venue: "Cancha Municipal 1",
          homeTeamId: "union",
          awayTeamId: "atletico",
          status: "scheduled",
          homeGoals: null,
          awayGoals: null,
          events: []
        }
      ]
    },
    {
      id: "liga-norte",
      name: "Liga Norte Demo",
      city: "Zona Norte",
      season: "Apertura 2026",
      currentCompetitionId: "comp-liga-norte-2026",
      competitions: [
        {
          id: "comp-liga-norte-2026",
          name: "Torneo de Liga",
          type: "liga",
          season: "Apertura 2026",
          status: "active",
          startsAt: "",
          endsAt: ""
        }
      ],
      status: "suspended",
      plan: "Sin limite",
      ownerEmail: "pendiente@demo.com",
      renewalDate: "2026-06-01",
      adBanner: "Liga suspendida temporalmente",
      identity: {
        nickname: "Identidad pendiente",
        activities: "",
        publicIntro: "Informacion publica disponible cuando la liga vuelva a estar activa.",
        primaryColor: "#34699a",
        accentColor: "#b8d84c",
        secondaryColor: "#0f6b4f"
      },
      highlights: ["Informacion no disponible mientras la liga este suspendida."],
      announcements: [],
      teams: [],
      players: [],
      matches: []
    }
  ]
};
