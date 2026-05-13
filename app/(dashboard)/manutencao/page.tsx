import { redirect } from "next/navigation";

/**
 * `/manutencao` é só um agrupador no menu (registry tem submodules:
 * preventiva, corretiva, limpeza, consertos). Quando a sidebar está
 * colapsada, o item aponta para o basePath — sem essa redirect daria 404.
 *
 * Vai pra preventiva: é o único submodule com dados reais hoje (corretiva,
 * consertos e limpeza são stubs ou parciais).
 */
export default function ManutencaoPage() {
  redirect("/manutencao/preventiva");
}
