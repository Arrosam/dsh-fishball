/** Poll `cond` on the event loop until it holds; no deadline (a hang shows as a hang). */
export async function until(cond) {
  while (!(await cond())) await new Promise((resolve) => setTimeout(resolve, 5))
}
