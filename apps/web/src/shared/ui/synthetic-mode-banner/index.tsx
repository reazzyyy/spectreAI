/**
 * Visible reminder that D-012 / O-002 still force SyntheticAIProvider —
 * UI must not look like production OpenAI.
 */
export function SyntheticModeBanner() {
  return (
    <p role="status">
      Синтетический режим: AI не отправляет данные во внешний провайдер. Используются
      только тестовые данные.
    </p>
  );
}
