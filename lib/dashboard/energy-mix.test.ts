/**
 * Testes de `computeConsumoMix` — função pura que compõe o medidor "Consumo
 * por fonte de geração" do dashboard a partir dos agregados do getKpis.
 *
 * Mocks de auth/db: o módulo importa `getDb` (via ./scope) e
 * `retryClosedConnection` para a query de injeção, não exercitados aqui.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  scopedPrisma: vi.fn(),
  retryClosedConnection: vi.fn(),
}));

import { computeConsumoMix } from "./energy-mix";

describe("computeConsumoMix", () => {
  it("caso real Março/2026: contratada 22,7%, distribuidora 77,3%", () => {
    const mix = computeConsumoMix({
      consumoTotalKwh: 2_777_902,
      geracaoPropriaKwh: 0,
      geracaoContratadaKwh: 631_016,
    });
    expect(mix.pctPropria).toBeCloseTo(0, 5);
    expect(mix.pctContratada).toBeCloseTo(22.715, 2);
    expect(mix.pctDistribuidora).toBeCloseTo(77.284, 2);
    expect(mix.distribuidoraKwh).toBe(2_777_902 - 631_016);
    expect(mix.cobertoKwh).toBe(631_016);
  });

  it("própria + contratada + distribuidora fecham 100%", () => {
    const mix = computeConsumoMix({
      consumoTotalKwh: 1000,
      geracaoPropriaKwh: 300,
      geracaoContratadaKwh: 200,
    });
    expect(
      (mix.pctPropria ?? 0) +
        (mix.pctContratada ?? 0) +
        (mix.pctDistribuidora ?? 0),
    ).toBeCloseTo(100, 9);
  });

  it("geração acima do consumo: distribuidora clampa em 0 (não negativa)", () => {
    const mix = computeConsumoMix({
      consumoTotalKwh: 500,
      geracaoPropriaKwh: 400,
      geracaoContratadaKwh: 300,
    });
    expect(mix.distribuidoraKwh).toBe(0);
    expect(mix.pctDistribuidora).toBe(0);
    // O % real pode passar de 100 — o clamp visual é responsabilidade do gauge.
    expect(mix.pctPropria).toBeCloseTo(80, 9);
    expect(mix.pctContratada).toBeCloseTo(60, 9);
  });

  it("sem consumo no período → percentuais null (UI mostra vazio)", () => {
    const mix = computeConsumoMix({
      consumoTotalKwh: 0,
      geracaoPropriaKwh: 100,
      geracaoContratadaKwh: 50,
    });
    expect(mix.pctPropria).toBeNull();
    expect(mix.pctContratada).toBeNull();
    expect(mix.pctDistribuidora).toBeNull();
  });
});
