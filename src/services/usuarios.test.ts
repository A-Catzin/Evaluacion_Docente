import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerUsuarios } from "./usuarios";

type Filter = { method: string; args: unknown[] };

class MockQueryBuilder {
  filters: Filter[] = [];
  selectFields = "";

  constructor(private readonly table: string) {}

  select(fields: string) {
    this.selectFields = fields;
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ method: "eq", args: [field, value] });
    return this;
  }

  in(field: string, values: unknown[]) {
    this.filters.push({ method: "in", args: [field, values] });
    return this;
  }

  order(field: string) {
    this.filters.push({ method: "order", args: [field] });
    return this;
  }

  then<T>(
    onFulfilled?: ((value: unknown) => T | PromiseLike<T>) | null,
    onRejected?: ((reason: unknown) => T | PromiseLike<T>) | null,
  ): Promise<T> {
    const usuarios = [
      { id: "teacher-user", email: "teacher@example.com", rol: "docente", entidad_id: 7 },
      { id: "admin-user", email: "admin@example.com", rol: "superadmin", entidad_id: null },
    ];
    const roleFilter = this.filters.find((filter) => filter.method === "eq" && filter.args[0] === "rol");
    const data = this.table === "usuarios"
      ? usuarios.filter((usuario) => !roleFilter || usuario.rol === roleFilter.args[1])
      : [{ id: 7, nombre: "Ana", apellidos: "López", num_empleado: "D-7" }];
    return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
  }
}

describe("obtenerUsuarios", () => {
  it("uses the injected client and enriches all docentes with one batch query", async () => {
    const from = vi.fn((table: string) => new MockQueryBuilder(table));
    const client = { from } as unknown as SupabaseClient;

    const usuarios = await obtenerUsuarios(client, "docente");

    expect(usuarios).toEqual([
      expect.objectContaining({
        id: "teacher-user",
        nombre_completo: "ANA LÓPEZ",
        matricula_o_empleado: "D-7",
      }),
    ]);
    expect(from).toHaveBeenCalledTimes(2);
    expect(from).toHaveBeenNthCalledWith(1, "usuarios");
    expect(from).toHaveBeenNthCalledWith(2, "docentes");

    const usuarioQuery = from.mock.results[0].value as MockQueryBuilder;
    const docenteQuery = from.mock.results[1].value as MockQueryBuilder;
    expect(usuarioQuery.selectFields).toBe("id,email,rol,entidad_id");
    expect(usuarioQuery.filters).toContainEqual({ method: "eq", args: ["rol", "docente"] });
    expect(docenteQuery.filters).toContainEqual({ method: "in", args: ["id", [7]] });
  });
});
