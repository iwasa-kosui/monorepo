type flow = {
  <I, O>(input: I, fn1: (input: I) => O): O;
  <I, O1, O2>(
    input: I,
    fn1: (input: I) => O1,
    fn2: (input: O1) => O2
  ): O2;
  <I, O1, O2, O3>(
    input: I,
    fn1: (input: I) => O1,
    fn2: (input: O1) => O2,
    fn3: (input: O2) => O3
  ): O3;
  <I, O1, O2, O3, O4>(
    input: I,
    fn1: (input: I) => O1,
    fn2: (input: O1) => O2,
    fn3: (input: O2) => O3,
    fn4: (input: O3) => O4
  ): O4;
  <I, O1, O2, O3, O4, O5>(
    input: I,
    fn1: (input: I) => O1,
    fn2: (input: O1) => O2,
    fn3: (input: O2) => O3,
    fn4: (input: O3) => O4,
    fn5: (input: O4) => O5
  ): O5;
  <I, O1, O2, O3, O4, O5, O6>(
    input: I,
    fn1: (input: I) => O1,
    fn2: (input: O1) => O2,
    fn3: (input: O2) => O3,
    fn4: (input: O3) => O4,
    fn5: (input: O4) => O5,
    fn6: (input: O5) => O6
  ): O6;
  <I, O1, O2, O3, O4, O5, O6, O7>(
    input: I,
    fn1: (input: I) => O1,
    fn2: (input: O1) => O2,
    fn3: (input: O2) => O3,
    fn4: (input: O3) => O4,
    fn5: (input: O4) => O5,
    fn6: (input: O5) => O6,
    fn7: (input: O6) => O7
  ): O7;
  <I, O1, O2, O3, O4, O5, O6, O7, O8>(
    input: I,
    fn1: (input: I) => O1,
    fn2: (input: O1) => O2,
    fn3: (input: O2) => O3,
    fn4: (input: O3) => O4,
    fn5: (input: O4) => O5,
    fn6: (input: O5) => O6,
    fn7: (input: O6) => O7,
    fn8: (input: O7) => O8
  ): O8;
  <I, O1, O2, O3, O4, O5, O6, O7, O8, O9>(
    input: I,
    fn1: (input: I) => O1,
    fn2: (input: O1) => O2,
    fn3: (input: O2) => O3,
    fn4: (input: O3) => O4,
    fn5: (input: O4) => O5,
    fn6: (input: O5) => O6,
    fn7: (input: O6) => O7,
    fn8: (input: O7) => O8,
    fn9: (input: O8) => O9
  ): O9;
  <I, O1, O2, O3, O4, O5, O6, O7, O8, O9, O10>(
    input: I,
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
  ): O10;
};

export const flow: flow = (input: unknown, ...fns: Array<Function>) => {
  return fns.reduce((acc, fn) => fn(acc), input);
};
