export function paginateJobs(jobs, pageSize = 5, page = 0) {
  const list = Array.isArray(jobs) ? jobs : [];
  const size = pageSize === 'all' ? Math.max(1, list.length) : pageSize === 10 ? 10 : 5;
  const totalPages = Math.max(1, Math.ceil(list.length / size));
  const currentPage = Math.min(Math.max(0, Number.isInteger(page) ? page : 0), totalPages - 1);
  return {
    jobs: list.slice(currentPage * size, (currentPage + 1) * size),
    pageSize: size,
    page: currentPage,
    totalPages,
  };
}
