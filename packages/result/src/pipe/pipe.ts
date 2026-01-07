export type pipe = {
  <I, O1>(fn1: (input: I) => O1): (input: I) => O1;
  <I, O1, O2>(
    fn1: (input: I) => O1,
    fn2: (input: O1) => O2
  ): (input: I) => O2;
  <I, O1, O2, O3>(
    fn1: (input: I) => O1,
    fn2: (input: O1) => O2,
    fn3: (input: O2) => O3
  ): (input: I) => O3;
  <I, O1, O2, O3, O4>(
    fn1: (input: I) => O1,
    fn2: (input: O1) => O2,
    fn3: (input: O2) => O3,
    fn4: (input: O3) => O4
  ): (input: I) => O4;
  <I, O1, O2, O3, O4, O5>(
    fn1: (input: I) => O1,
    fn2: (input: O1) => O2,
    fn3: (input: O2) => O3,
    fn4: (input: O3) => O4,
    fn5: (input: O4) => O5
  ): (input: I) => O5;
  <I, O1, O2, O3, O4, O5, O6>(
    fn1: (input: I) => O1,
    fn2: (input: O1) => O2,
    fn3: (input: O2) => O3,
    fn4: (input: O3) => O4,
    fn5: (input: O4) => O5,
    fn6: (input: O5) => O6
  ): (input: I) => O6;
  <I, O1, O2, O3, O4, O5, O6, O7>(
    fn1: (input: I) => O1,
    fn2: (input: O1) => O2,
    fn3: (input: O2) => O3,
    fn4: (input: O3) => O4,
    fn5: (input: O4) => O5,
    fn6: (input: O5) => O6,
    fn7: (input: O6) => O7
  ): (input: I) => O7;
  <I, O1, O2, O3, O4, O5, O6, O7, O8>(
    fn1: (input: I) => O1,
    fn2: (input: O1) => O2,
    fn3: (input: O2) => O3,
    fn4: (input: O3) => O4,
    fn5: (input: O4) => O5,
    fn6: (input: O5) => O6,
    fn7: (input: O6) => O7,
    fn8: (input: O7) => O8
  ): (input: I) => O8;
  <I, O1, O2, O3, O4, O5, O6, O7, O8, O9>(
    fn1: (input: I) => O1,
    fn2: (input: O1) => O2,
    fn3: (input: O2) => O3,
    fn4: (input: O3) => O4,
    fn5: (input: O4) => O5,
    fn6: (input: O5) => O6,
    fn7: (input: O6) => O7,
    fn8: (input: O7) => O8,
    fn9: (input: O8) => O9
  ): (input: I) => O9;
  <I, O1, O2, O3, O4, O5, O6, O7, O8, O9, O10>(
    fn1: (input: I) => O1,
    fn2: (input: O1) => O2,
    fn3: (input: O2) => O3,
    fn4: (input: O3) => O4,
    fn5: (input: O4) => O5,
    fn6: (input: O5) => O6,
    fn7: (input: O6) => O7,
    fn8: (input: O7) => O8,
    fn9: (input: O8) => O9,
    fn10: (input: O9) => O10
  ): (input: I) => O10;
}
export const pipe: pipe = ((...fns: Function[]) => (input: unknown) =>
  fns.reduce((acc, fn) => fn(acc), input)) as pipe;
