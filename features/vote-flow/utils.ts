export function formatVoteDate(voteDate: string): string {
  const [y, m, d] = voteDate.split("-");
  if (!y || !m || !d) return voteDate;

  const month = parseInt(m, 10);
  const day = parseInt(d, 10);
  return `${y}年${month}月${day}日`;
}
