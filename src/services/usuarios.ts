/**
 * Servicio de Usuarios — Gestión de roles y perfiles
 */
import { db } from "../lib/db";
import { formatPersonName } from "../lib/personName";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RolUsuario, Usuario } from "../types/supabase";

export interface UsuarioConNombre
  extends Pick<Usuario, "id" | "email" | "rol" | "entidad_id"> {
  nombre_completo: string;
  matricula_o_empleado: string;
}

export async function obtenerUsuarios(
  cliente: SupabaseClient,
  rol?: RolUsuario,
): Promise<UsuarioConNombre[]> {
  let query = cliente
    .from("usuarios")
    .select("id,email,rol,entidad_id");

  if (rol) query = query.eq("rol", rol);

  const { data: usuarios, error } = await query.order("email");

  if (error) throw new Error("Error al obtener usuarios");

  const docenteIds = [
    ...new Set(
      (usuarios || [])
        .filter((usuario) => usuario.rol === "docente" && usuario.entidad_id)
        .map((usuario) => Number(usuario.entidad_id)),
    ),
  ];
  const docentesPorId = new Map<
    number,
    { nombre: string; apellidos: string; num_empleado: string | null }
  >();

  if (docenteIds.length) {
    const { data: docentes, error: docentesError } = await cliente
      .from("docentes")
      .select("id,nombre,apellidos,num_empleado")
      .in("id", docenteIds);

    if (docentesError) throw new Error("Error al obtener docentes");

    for (const docente of docentes || []) {
      docentesPorId.set(docente.id, docente);
    }
  }

  return (usuarios || []).map((usuario) => {
    const docente = usuario.entidad_id
      ? docentesPorId.get(Number(usuario.entidad_id))
      : undefined;
    const nombre = docente
      ? `${docente.nombre} ${docente.apellidos}`
      : usuario.email.split("@")[0].replace(/[._]/g, " ");

    return {
      ...usuario,
      nombre_completo: formatPersonName(nombre),
      matricula_o_empleado: docente?.num_empleado || "—",
    };
  });
}

export async function cambiarRolUsuario(
  userId: string,
  nuevoRol: RolUsuario,
): Promise<void> {
  const { error } = await db()
    .from("usuarios")
    .update({ rol: nuevoRol })
    .eq("id", userId);
  if (error) throw new Error("Error al cambiar rol");
}

export async function buscarUsuarios(
  termino: string,
): Promise<UsuarioConNombre[]> {
  const todos = await obtenerUsuarios(db());
  const t = termino.toLowerCase();
  return todos.filter(
    (u) =>
      u.nombre_completo.toLowerCase().includes(t) ||
      u.email.toLowerCase().includes(t) ||
      u.matricula_o_empleado.toLowerCase().includes(t),
  );
}
