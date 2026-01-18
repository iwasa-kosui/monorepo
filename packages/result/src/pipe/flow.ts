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
  <I, O1, O2, O3, O4, O5, O6, O7, O8, O9, O10, O11>(
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
    fn10: (input: O9) => O10,
    fn11: (input: O10) => O11
  ): O11;
  <I, O1, O2, O3, O4, O5, O6, O7, O8, O9, O10, O11, O12>(
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
    fn10: (input: O9) => O10,
    fn11: (input: O10) => O11,
    fn12: (input: O11) => O12
  ): O12;
  <I, O1, O2, O3, O4, O5, O6, O7, O8, O9, O10, O11, O12, O13>(
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
    fn10: (input: O9) => O10,
    fn11: (input: O10) => O11,
    fn12: (input: O11) => O12,
    fn13: (input: O12) => O13
  ): O13;
  <I, O1, O2, O3, O4, O5, O6, O7, O8, O9, O10, O11, O12, O13, O14>(
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
    fn10: (input: O9) => O10,
    fn11: (input: O10) => O11,
    fn12: (input: O11) => O12,
    fn13: (input: O12) => O13,
    fn14: (input: O13) => O14
  ): O14;
  <I, O1, O2, O3, O4, O5, O6, O7, O8, O9, O10, O11, O12, O13, O14, O15>(
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
    fn10: (input: O9) => O10,
    fn11: (input: O10) => O11,
    fn12: (input: O11) => O12,
    fn13: (input: O12) => O13,
    fn14: (input: O13) => O14,
    fn15: (input: O14) => O15
  ): O15;
  <I, O1, O2, O3, O4, O5, O6, O7, O8, O9, O10, O11, O12, O13, O14, O15, O16>(
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
    fn10: (input: O9) => O10,
    fn11: (input: O10) => O11,
    fn12: (input: O11) => O12,
    fn13: (input: O12) => O13,
    fn14: (input: O13) => O14,
    fn15: (input: O14) => O15,
    fn16: (input: O15) => O16
  ): O16;
  <I, O1, O2, O3, O4, O5, O6, O7, O8, O9, O10, O11, O12, O13, O14, O15, O16, O17>(
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
    fn10: (input: O9) => O10,
    fn11: (input: O10) => O11,
    fn12: (input: O11) => O12,
    fn13: (input: O12) => O13,
    fn14: (input: O13) => O14,
    fn15: (input: O14) => O15,
    fn16: (input: O15) => O16,
    fn17: (input: O16) => O17
  ): O17;
  <I, O1, O2, O3, O4, O5, O6, O7, O8, O9, O10, O11, O12, O13, O14, O15, O16, O17, O18>(
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
    fn10: (input: O9) => O10,
    fn11: (input: O10) => O11,
    fn12: (input: O11) => O12,
    fn13: (input: O12) => O13,
    fn14: (input: O13) => O14,
    fn15: (input: O14) => O15,
    fn16: (input: O15) => O16,
    fn17: (input: O16) => O17,
    fn18: (input: O17) => O18
  ): O18;
  <I, O1, O2, O3, O4, O5, O6, O7, O8, O9, O10, O11, O12, O13, O14, O15, O16, O17, O18, O19>(
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
    fn10: (input: O9) => O10,
    fn11: (input: O10) => O11,
    fn12: (input: O11) => O12,
    fn13: (input: O12) => O13,
    fn14: (input: O13) => O14,
    fn15: (input: O14) => O15,
    fn16: (input: O15) => O16,
    fn17: (input: O16) => O17,
    fn18: (input: O17) => O18,
    fn19: (input: O18) => O19
  ): O19;
  <I, O1, O2, O3, O4, O5, O6, O7, O8, O9, O10, O11, O12, O13, O14, O15, O16, O17, O18, O19, O20>(
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
    fn10: (input: O9) => O10,
    fn11: (input: O10) => O11,
    fn12: (input: O11) => O12,
    fn13: (input: O12) => O13,
    fn14: (input: O13) => O14,
    fn15: (input: O14) => O15,
    fn16: (input: O15) => O16,
    fn17: (input: O16) => O17,
    fn18: (input: O17) => O18,
    fn19: (input: O18) => O19,
    fn20: (input: O19) => O20
  ): O20;
};

export const flow: flow = (input: unknown, ...fns: Array<Function>) => {
  return fns.reduce((acc, fn) => fn(acc), input);
};
