// Синхронный guard от двойного сохранения: флаг обычная переменная замыкания, а не
// React state — второй вызов run() в тот же тик (до любого ре-рендера) видит уже
// установленный флаг и не выполняет fn. После ошибки (или успеха) флаг снимается,
// повторная попытка снова разрешена.
export function createSubmissionGuard() {
 let pending = false;
 return {
  get pending() { return pending },
  async run<T>(fn: () => Promise<T>): Promise<T | undefined> {
   if (pending) return undefined;
   pending = true;
   try {
    return await fn();
   } finally {
    pending = false;
   }
  },
 };
}
