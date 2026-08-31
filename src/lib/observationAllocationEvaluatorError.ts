type RpcError = { code?: string | null } | null | undefined;

export type EvaluatorLoadFailure = {
  code: string;
  cause: string;
};

export function describeEvaluatorLoadFailure(error: RpcError): EvaluatorLoadFailure {
  const databaseCode = typeof error?.code === "string" && /^[A-Za-z0-9]{2,16}$/.test(error.code)
    ? error.code.toUpperCase()
    : "UNKNOWN";

  if (databaseCode === "42804") {
    return {
      code: "EVAL_RPC_42804",
      cause: "El contrato de retorno del RPC no coincide. Aplica la migración 054 y recarga la caché de PostgREST.",
    };
  }

  if (databaseCode === "PGRST202" || databaseCode === "42883") {
    return {
      code: `EVAL_RPC_${databaseCode}`,
      cause: "PostgREST no encuentra la firma publicada del RPC. Confirma las migraciones 052 a 054 y recarga su caché.",
    };
  }

  if (databaseCode === "42501") {
    return {
      code: "EVAL_RPC_42501",
      cause: "La sesión no tiene un perfil superadmin activo y resuelto, o falta el permiso EXECUTE para authenticated.",
    };
  }

  if (databaseCode === "42P01") {
    return {
      code: "EVAL_RPC_42P01",
      cause: "Falta una relación requerida por el RPC. Confirma que las migraciones 051 a 054 se aplicaron en orden.",
    };
  }

  return {
    code: `EVAL_RPC_${databaseCode}`,
    cause: "El RPC rechazó la consulta. Ejecuta las verificaciones de función, firma y permisos documentadas para este código.",
  };
}
