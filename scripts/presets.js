export const PRESETS = {
  short22: {
    symbol: '22X22',
    merge: [
      { kind:'const', name:'C1', value:'~101', maxChars:4 },
      { kind:'var',   name:'GTIN', value:'00000000000000', maxChars:14 },
      { kind:'const', name:'C2', value:'21', maxChars:2 },
      { kind:'var',   name:'SN', value:'000000', maxChars:6 },
      { kind:'const', name:'C3', value:'~d02993', maxChars:7 },
      { kind:'var',   name:'KRIPTO', value:'0000', maxChars:4 },
    ],
  },
  std36: {
    symbol: '36X36',
    merge: [
      { kind:'const', name:'C1', value:'~101', maxChars:4 },
      { kind:'var',   name:'GTIN', value:'00000000000000', maxChars:14 },
      { kind:'const', name:'C2', value:'21', maxChars:2 },
      { kind:'var',   name:'SN', value:'000000', maxChars:6 },
      { kind:'const', name:'C3', value:'~d02991', maxChars:7 },
      { kind:'var',   name:'KRIPTO', value:'0000', maxChars:4 },
      { kind:'const', name:'C4', value:'~d02992', maxChars:7 },
      { kind:'var',   name:'KRIPTO2', value:'0000000000000000000000000000000000000000', maxChars:44 },
    ],
  }
};