import { findColumn, normalizeText, parseCsv } from "./importCsv";

type RuntimeId = number | string | null | undefined;

export type AcademicOfferImportRow = {
  row: number;
  plan: string;
  group: string;
};

export type AcademicOfferImportOffer = {
  id: number | string;
  nombre?: string | null;
};

export type AcademicOfferImportSubject = {
  id: number | string;
  oferta_academica_id?: number | string | null;
};

export type AcademicOfferImportGroup = {
  id: number | string;
  cuatrimestre_id?: number | string | null;
  asignatura_id?: number | string | null;
  plan_normalizado?: string | null;
  grupo_normalizado?: string | null;
  clave?: string | null;
  grado?: string | null;
};

export type AcademicOfferImportFinding = {
  row: number;
  reason: string;
  details?: Record<string, unknown>;
};

export type AcademicOfferImportAction = {
  actionKey: string;
  row: number;
  rows: number[];
  kind: "link" | "no-op";
  offerNormalized: string;
  offerName: string;
  offerId: number | null;
  subjectId: number;
  expectedSubjectOfferId: number | null;
  groupMatches: Array<{
    groupId: number;
    plan: string;
    group: string;
    grade: string;
  }>;
};

export type AcademicOfferImportPlan = {
  rowsRead: number;
  actions: AcademicOfferImportAction[];
  blockers: AcademicOfferImportFinding[];
  warnings: AcademicOfferImportFinding[];
  summary: {
    links: number;
    noOp: number;
    offersToCreate: number;
    offersReused: number;
    blockers: number;
    warningCount: number;
  };
};

function numericId(value: RuntimeId): number | null {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function sameId(left: RuntimeId, right: RuntimeId) {
  const normalizedLeft = numericId(left);
  return normalizedLeft !== null && normalizedLeft === numericId(right);
}

/**
 * The class report sometimes appends its modality after " - ". Keep every
 * other hyphenated group label intact: it is part of the group identity.
 */
export function normalizeAcademicOfferGroup(value: string | null | undefined) {
  const normalized = normalizeText(value)
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = normalized.match(
    /^(.*) - (ESCOLARIZADO|VIRTUAL|EJECUTIVO|INGLES|EJECUTIVO \/ INGLES|MATUTINO|VESPERTINO|MIXTO|NOCTURNO|SABATINO|DOMINICAL)$/,
  );
  return (match ? match[1] : normalized).trim();
}

export function parseAcademicOfferCsv(text: string): {
  rows: AcademicOfferImportRow[];
  blockers: AcademicOfferImportFinding[];
} {
  const records = parseCsv(text.replace(/^\uFEFF/, ""));
  if (records.length < 2)
    return { rows: [], blockers: [{ row: 1, reason: "archivo_vacio" }] };

  const headers = records[0];
  const planColumn = findColumn(
    headers,
    "Plan de Estudios",
    "PLAN DE ESTUDIOS",
  );
  const groupColumn = findColumn(headers, "Grupo");
  if (planColumn < 0 || groupColumn < 0) {
    return {
      rows: [],
      blockers: [
        {
          row: 1,
          reason: "contrato_invalido",
          details: { required: "Plan de Estudios, Grupo" },
        },
      ],
    };
  }

  const value = (record: string[], column: number) =>
    (record[column] || "").trim();
  return {
    rows: records.slice(1).map((record, offset) => ({
      row: offset + 2,
      plan: value(record, planColumn),
      group: value(record, groupColumn),
    })),
    blockers: [],
  };
}

/** Pure reconciliation used by the write-free preview. */
export function planAcademicOfferImport(input: {
  cycleId: number;
  rows: AcademicOfferImportRow[];
  initialBlockers?: AcademicOfferImportFinding[];
  offers: AcademicOfferImportOffer[];
  subjects: AcademicOfferImportSubject[];
  groups: AcademicOfferImportGroup[];
}): AcademicOfferImportPlan {
  const blockers = [...(input.initialBlockers || [])];
  const warnings: AcademicOfferImportFinding[] = [];
  const actions = new Map<string, AcademicOfferImportAction>();
  const offeredSubjectKeys = new Map<number, Set<string>>();

  for (const row of input.rows) {
    const plan = normalizeText(row.plan);
    const group = normalizeAcademicOfferGroup(row.group);
    const missingFields = [
      ["plan", plan],
      ["group", group],
    ]
      .filter(([, value]) => !value)
      .map(([field]) => field);
    if (missingFields.length) {
      warnings.push({
        row: row.row,
        reason: "fila_incompleta",
        details: { missingFields },
      });
      continue;
    }

    const matchingOffers = input.offers.filter(
      (offer) => normalizeText(offer.nombre) === plan,
    );
    if (matchingOffers.length > 1) {
      blockers.push({
        row: row.row,
        reason: "oferta_ambigua",
        details: { offerIds: matchingOffers.map((offer) => offer.id) },
      });
      continue;
    }
    const offerId =
      matchingOffers.length === 1 ? numericId(matchingOffers[0].id) : null;
    if (matchingOffers.length === 1 && offerId === null) {
      blockers.push({ row: row.row, reason: "oferta_insegura" });
      continue;
    }

    const matchingGroups = input.groups.filter(
      (candidate) =>
        sameId(candidate.cuatrimestre_id, input.cycleId) &&
        numericId(candidate.asignatura_id) !== null &&
        normalizeText(candidate.plan_normalizado) === plan &&
        normalizeAcademicOfferGroup(
          candidate.grupo_normalizado || candidate.clave,
        ) === group,
    );
    if (!matchingGroups.length) {
      blockers.push({
        row: row.row,
        reason: "grupo_no_encontrado",
        details: { cycleId: input.cycleId, plan, group },
      });
      continue;
    }
    const grades = [
      ...new Set(
        matchingGroups
          .map((candidate) => normalizeText(candidate.grado))
          .filter(Boolean),
      ),
    ];
    if (grades.length !== 1) {
      blockers.push({
        row: row.row,
        reason: grades.length ? "grado_ambiguo" : "grado_no_identificado",
        details: {
          groupIds: matchingGroups.map((candidate) => candidate.id),
          grades,
        },
      });
      continue;
    }

    for (const matchedGroup of matchingGroups) {
      const subjectId = numericId(matchedGroup.asignatura_id);
      const groupId = numericId(matchedGroup.id);
      if (subjectId === null || groupId === null) {
        blockers.push({ row: row.row, reason: "asignatura_insegura" });
        continue;
      }
      const subjectMatches = input.subjects.filter((subject) =>
        sameId(subject.id, subjectId),
      );
      if (subjectMatches.length !== 1) {
        blockers.push({
          row: row.row,
          reason: subjectMatches.length
            ? "asignatura_ambigua"
            : "asignatura_no_encontrada",
          details: { subjectId, matches: subjectMatches.length },
        });
        continue;
      }
      const currentOfferId = numericId(subjectMatches[0].oferta_academica_id);
      if (currentOfferId !== null && currentOfferId !== offerId) {
        blockers.push({
          row: row.row,
          reason: "asignatura_en_conflicto",
          details: { subjectId, currentOfferId, requestedOfferId: offerId },
        });
        continue;
      }

      const actionKey = `${plan}|${subjectId}`;
      const action = actions.get(actionKey);
      if (action) {
        if (!action.rows.includes(row.row)) action.rows.push(row.row);
        if (!action.groupMatches.some((match) => match.groupId === groupId))
          action.groupMatches.push({ groupId, plan, group, grade: grades[0] });
      } else {
        actions.set(actionKey, {
          actionKey,
          row: row.row,
          rows: [row.row],
          kind:
            currentOfferId === offerId && offerId !== null ? "no-op" : "link",
          offerNormalized: plan,
          offerName: row.plan.trim(),
          offerId,
          subjectId,
          expectedSubjectOfferId: currentOfferId,
          groupMatches: [{ groupId, plan, group, grade: grades[0] }],
        });
      }
      const subjectOffers =
        offeredSubjectKeys.get(subjectId) || new Set<string>();
      subjectOffers.add(plan);
      offeredSubjectKeys.set(subjectId, subjectOffers);
    }
  }

  const conflictedSubjects = new Set(
    [...offeredSubjectKeys.entries()]
      .filter(([, offers]) => offers.size > 1)
      .map(([subjectId]) => subjectId),
  );
  const safeActions = [...actions.values()].filter((action) => {
    if (!conflictedSubjects.has(action.subjectId)) return true;
    blockers.push({
      row: action.row,
      reason: "asignatura_en_ofertas_conflictivas",
      details: { subjectId: action.subjectId },
    });
    return false;
  });
  const offersByPlan = new Map<string, number | null>();
  for (const action of safeActions)
    offersByPlan.set(action.offerNormalized, action.offerId);

  return {
    rowsRead: input.rows.length,
    actions: safeActions,
    blockers,
    warnings,
    summary: {
      links: safeActions.filter((action) => action.kind === "link").length,
      noOp: safeActions.filter((action) => action.kind === "no-op").length,
      offersToCreate: [...offersByPlan.values()].filter((id) => id === null)
        .length,
      offersReused: [...offersByPlan.values()].filter((id) => id !== null)
        .length,
      blockers: blockers.length,
      warningCount: warnings.length,
    },
  };
}
