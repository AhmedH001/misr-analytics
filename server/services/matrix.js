// Matrix operations for OLS regression
module.exports = {
  // Transpose: m×n → n×m
  T(A) {
    if (!A.length) return [];
    return A[0].map((_, j) => A.map(row => row[j]));
  },

  // Matrix × Matrix
  mul(A, B) {
    const m = A.length, k = B.length, n = B[0].length;
    return Array.from({ length: m }, (_, i) =>
      Array.from({ length: n }, (_, j) =>
        A[i].reduce((s, _, l) => s + A[i][l] * B[l][j], 0)));
  },

  // Matrix × Vector
  mulV(A, v) {
    return A.map(row => row.reduce((s, a, j) => s + a * v[j], 0));
  },

  // Gauss-Jordan inversion with partial pivoting
  inv(A) {
    const n = A.length;
    const M = A.map((row, i) =>
      [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
    for (let c = 0; c < n; c++) {
      let pivR = c;
      for (let r = c + 1; r < n; r++)
        if (Math.abs(M[r][c]) > Math.abs(M[pivR][c])) pivR = r;
      [M[c], M[pivR]] = [M[pivR], M[c]];
      const piv = M[c][c];
      if (Math.abs(piv) < 1e-12) { M[c][c] += 1e-8; continue; }
      for (let j = 0; j < 2 * n; j++) M[c][j] /= piv;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c];
        for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
      }
    }
    return M.map(row => row.slice(n));
  },
};
