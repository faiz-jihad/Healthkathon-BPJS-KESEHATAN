/**
 * AURA-JKN: Mock Store Deprecated
 * ===============================
 * Sesuai kebijakan ZERO MOCK DATA POLICY, in-memory mock store telah dihapus.
 * Seluruh data aplikasi disimpan secara persisten di database PostgreSQL (port 5432)
 * dan dievaluasi langsung oleh model R-GCN PyTorch Geometric (port 8000).
 *
 * File ini hanya menyediakan referensi balik ke benchmark fixtures untuk keperluan backward-compatibility compiler.
 */

export * from "./benchmark-fixtures";
export { BENCHMARK_CLAIMS_FIXTURES as INITIAL_CLAIMS_DATASET } from "./benchmark-fixtures";
