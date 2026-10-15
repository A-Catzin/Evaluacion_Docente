/**
 * Servicio de Catálogos — Cuatrimestres, Licenciaturas, Asignaturas
 */
import { db } from "../lib/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
 Cuatrimestre,
 Licenciatura,
 Asignatura,
 OfertaAcademica,
 Campus,
 Turno,
} from "../types/supabase";

// ─── Cuatrimestres ──────────────────────────────────────────────

function logCatalogError(operation: string, error: {
 message: string;
 code?: string;
 details?: string | null;
 hint?: string | null;
}): void {
 console.error(`[catalogos] ${operation}`, {
  message: error.message,
  code: error.code,
  details: error.details,
  hint: error.hint,
 });
}

export async function obtenerCuatrimestres(
 cliente: SupabaseClient = db(),
): Promise<Cuatrimestre[]> {
 const { data, error } = await cliente
  .from("cuatrimestres")
  .select("*")
  .order("id", { ascending: false });
 if (error) {
  logCatalogError("Error al obtener cuatrimestres", error);
  throw new Error("Error al obtener cuatrimestres");
 }
 return data as Cuatrimestre[];
}

export async function obtenerCuatrimestreActivo(
 cliente: SupabaseClient = db(),
): Promise<Cuatrimestre | null> {
 const { data, error } = await cliente
  .from("cuatrimestres")
  .select("*")
  .eq("activo", true)
  .maybeSingle();
 if (error) {
  logCatalogError("Error al obtener cuatrimestre activo", error);
  throw new Error("Error al obtener cuatrimestre activo");
 }
 return data as Cuatrimestre | null;
}

export async function crearCuatrimestre(
 c: Partial<Cuatrimestre>,
): Promise<Cuatrimestre> {
 const { data, error } = await db()
  .from("cuatrimestres")
  .insert(c)
  .select()
  .single();
 if (error) {
  logCatalogError("Error al crear cuatrimestre", error);
  throw new Error("Error al crear cuatrimestre");
 }
 return data as Cuatrimestre;
}

export async function cerrarCuatrimestre(id: number): Promise<void> {
 const { error } = await db()
  .from("cuatrimestres")
  .update({ cerrado: true, activo: false })
  .eq("id", id);
 if (error) {
  logCatalogError("Error al cerrar cuatrimestre", error);
  throw new Error("Error al cerrar cuatrimestre");
 }
}

// ─── Licenciaturas ─────────────────────────────────────────────

export async function obtenerLicenciaturas(): Promise<Licenciatura[]> {
 const { data, error } = await db()
  .from("licenciaturas")
  .select("*")
  .order("nombre");
 if (error) {
  logCatalogError("Error al obtener licenciaturas", error);
  throw new Error("Error al obtener licenciaturas");
 }
 return data as Licenciatura[];
}

// ─── Asignaturas ───────────────────────────────────────────────

export async function obtenerAsignaturas(
 licenciaturaId?: number,
): Promise<Asignatura[]> {
 let query = db().from("asignaturas").select("*").order("nombre");
 if (licenciaturaId) query = query.eq("licenciatura_id", licenciaturaId);
 const { data, error } = await query;
 if (error) {
  logCatalogError("Error al obtener asignaturas", error);
  throw new Error("Error al obtener asignaturas");
 }
 return data as Asignatura[];
}

// ─── Ofertas Académicas ────────────────────────────────────────

export async function obtenerOfertasAcademicas(
 cliente: SupabaseClient = db(),
): Promise<OfertaAcademica[]> {
 const { data, error } = await cliente
  .from("ofertas_academicas")
  .select("*")
  .eq("activa", true)
  .order("nombre");
 if (error) {
  logCatalogError("Error al obtener ofertas académicas", error);
  throw new Error("Error al obtener ofertas académicas");
 }
 return data as OfertaAcademica[];
}

export async function obtenerCampus(
 cliente: SupabaseClient = db(),
): Promise<Campus[]> {
 const { data, error } = await cliente
  .from("campus")
  .select("*")
  .eq("activo", true)
  .order("nombre");
 if (error) {
  logCatalogError("Error al obtener campus", error);
  throw new Error("Error al obtener campus");
 }
 return data as Campus[];
}

export async function obtenerTurnos(
 cliente: SupabaseClient = db(),
): Promise<Turno[]> {
 const { data, error } = await cliente
  .from("turnos")
  .select("*")
  .eq("activo", true)
  .order("nombre");
 if (error) {
  logCatalogError("Error al obtener turnos", error);
  throw new Error("Error al obtener turnos");
 }
 return data as Turno[];
}
