/**
 * Testes do lookup de tarifa histórica + cálculo de valor distribuidora.
 *
 * Bugs evitados aqui: tarifa de UF errada se aplicar, vigência sobreposta
 * pegar a antiga, e cálculo errado quando a tarifa só tem ponta OU fora
 * ponta cadastrada (frequente em distribuidora de fora do horário azul).
 */
import { describe, expect, it } from "vitest";

import {
  calcValorDistribuidora,
  findTarifaPorData,
  refDateFromAnoMes,
  type TarifaSnapshot,
} from "./tarifa-lookup";

const energisaMaio: TarifaSnapshot = {
  uf: "MS",
  valorPonta: 1.2,
  valorForaPonta: 0.6,
  vigenciaInicio: new Date(2025, 4, 1), // 1-mai-2025
  vigenciaFim: new Date(2026, 4, 30), // 30-mai-2026
};
const energisaJunho: TarifaSnapshot = {
  uf: "MS",
  valorPonta: 1.3,
  valorForaPonta: 0.65,
  vigenciaInicio: new Date(2026, 5, 1), // 1-jun-2026
  vigenciaFim: null,
};
const copel: TarifaSnapshot = {
  uf: "PR",
  valorPonta: 1.1,
  valorForaPonta: 0.55,
  vigenciaInicio: new Date(2026, 0, 1),
  vigenciaFim: null,
};

describe("findTarifaPorData", () => {
  it("acha a tarifa vigente na data informada", () => {
    const t = findTarifaPorData(
      [energisaMaio, energisaJunho, copel],
      "MS",
      new Date(2026, 3, 15), // 15-abr-2026 — cobre energisaMaio
    );
    expect(t?.valorPonta).toBe(1.2);
  });

  it("seleciona a mais recente quando há sobreposição", () => {
    // Cria sobreposição artificial: ambas cobrem maio/2026.
    const t = findTarifaPorData(
      [
        { ...energisaMaio, vigenciaFim: new Date(2026, 11, 31) },
        energisaJunho,
      ],
      "MS",
      new Date(2026, 5, 15), // 15-jun-2026 — cobertas por ambas
    );
    expect(t?.valorPonta).toBe(1.3); // a mais recente
  });

  it("respeita UF — não usa Energisa MS pra registro do PR", () => {
    expect(
      findTarifaPorData([energisaMaio, copel], "PR", new Date(2026, 5, 15))
        ?.valorPonta,
    ).toBe(1.1);
  });

  it("retorna null se não há tarifa cobrindo a data", () => {
    expect(
      findTarifaPorData(
        [energisaJunho],
        "MS",
        new Date(2024, 5, 15), // antes da vigenciaInicio
      ),
    ).toBeNull();
  });

  it("retorna null para UF não cadastrada", () => {
    expect(
      findTarifaPorData([energisaMaio], "SP", new Date(2026, 0, 1)),
    ).toBeNull();
  });

  it("retorna null quando UF é null/undefined", () => {
    expect(findTarifaPorData([energisaMaio], null, new Date())).toBeNull();
    expect(
      findTarifaPorData([energisaMaio], undefined, new Date()),
    ).toBeNull();
  });
});

describe("findTarifaPorData — match por classe de tensão", () => {
  const energisaB3: TarifaSnapshot = {
    uf: "MS",
    valorPonta: 1.5,
    valorForaPonta: 0.8,
    vigenciaInicio: new Date(2026, 0, 1),
    vigenciaFim: null,
    classeTensao: "B3",
  };
  const energisaA4: TarifaSnapshot = {
    uf: "MS",
    valorPonta: 0.9,
    valorForaPonta: 0.5,
    vigenciaInicio: new Date(2026, 0, 1),
    vigenciaFim: null,
    classeTensao: "A4",
  };
  const energisaGenerica: TarifaSnapshot = {
    uf: "MS",
    valorPonta: 1.2,
    valorForaPonta: 0.6,
    vigenciaInicio: new Date(2026, 0, 1),
    vigenciaFim: null,
    classeTensao: null, // genérica
  };

  it("filial B3 + tarifa B3 → match exato", () => {
    const t = findTarifaPorData(
      [energisaB3, energisaA4],
      "MS",
      new Date(2026, 5, 1),
      "B3",
    );
    expect(t?.valorPonta).toBe(1.5);
  });

  it("filial B3 + tarifa A4 + nenhuma B3 → null (rejeita classe diferente)", () => {
    const t = findTarifaPorData(
      [energisaA4],
      "MS",
      new Date(2026, 5, 1),
      "B3",
    );
    expect(t).toBeNull();
  });

  it("filial sem classe + tarifa B3 → aceita (filial não restringiu)", () => {
    const t = findTarifaPorData(
      [energisaB3],
      "MS",
      new Date(2026, 5, 1),
      null,
    );
    expect(t?.valorPonta).toBe(1.5);
  });

  it("filial B3 + tarifa genérica → aceita (tarifa não restringiu)", () => {
    const t = findTarifaPorData(
      [energisaGenerica],
      "MS",
      new Date(2026, 5, 1),
      "B3",
    );
    expect(t?.valorPonta).toBe(1.2);
  });

  it("prefere tarifa com classe específica sobre genérica", () => {
    const t = findTarifaPorData(
      [energisaGenerica, energisaB3],
      "MS",
      new Date(2026, 5, 1),
      "B3",
    );
    expect(t?.valorPonta).toBe(1.5); // a B3 vence
    expect(t?.classeTensao).toBe("B3");
  });
});

describe("refDateFromAnoMes", () => {
  it("retorna último dia do mês pt-BR", () => {
    const d = refDateFromAnoMes(2026, "Março");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(2); // março
    expect(d?.getDate()).toBe(31);
  });

  it("tolera variações de case", () => {
    expect(refDateFromAnoMes(2026, "MARÇO")?.getMonth()).toBe(2);
    expect(refDateFromAnoMes(2026, "março")?.getMonth()).toBe(2);
  });

  it("retorna null para ano/mes inválidos", () => {
    expect(refDateFromAnoMes(null, "Janeiro")).toBeNull();
    expect(refDateFromAnoMes(2026, null)).toBeNull();
    expect(refDateFromAnoMes(2026, "Inválido")).toBeNull();
    expect(refDateFromAnoMes(0, "Janeiro")).toBeNull();
  });
});

describe("calcValorDistribuidora", () => {
  it("multiplica kwh ponta × tarifa ponta + kwh fora × tarifa fora", () => {
    expect(calcValorDistribuidora(100, 200, energisaMaio)).toBeCloseTo(
      100 * 1.2 + 200 * 0.6,
    );
  });

  it("retorna null quando a tarifa não tem nem ponta nem fora ponta", () => {
    const semNada: TarifaSnapshot = {
      uf: "MS",
      valorPonta: null,
      valorForaPonta: null,
      vigenciaInicio: new Date(2026, 0, 1),
      vigenciaFim: null,
    };
    expect(calcValorDistribuidora(100, 200, semNada)).toBeNull();
  });

  it("se só tem fora ponta, aplica fora ponta no total (conservador)", () => {
    const soFP: TarifaSnapshot = {
      uf: "MS",
      valorPonta: null,
      valorForaPonta: 0.7,
      vigenciaInicio: new Date(2026, 0, 1),
      vigenciaFim: null,
    };
    expect(calcValorDistribuidora(100, 200, soFP)).toBeCloseTo(300 * 0.7);
  });

  it("se só tem ponta, aplica ponta no total", () => {
    const soP: TarifaSnapshot = {
      uf: "MS",
      valorPonta: 1.5,
      valorForaPonta: null,
      vigenciaInicio: new Date(2026, 0, 1),
      vigenciaFim: null,
    };
    expect(calcValorDistribuidora(100, 200, soP)).toBeCloseTo(300 * 1.5);
  });
});
