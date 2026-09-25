export const ERAS = [
  ['春秋战国', '布币', '莲鹤方壶', '曾侯乙编钟', '越王勾践剑'],
  ['秦', '半两钱', '秦陵铜车马', '秦俑将军俑', '传国玉玺'],
  ['汉', '五铢钱', '长信宫灯', '马王堆帛画', '金缕玉衣'],
  ['三国', '太平道符', '铜雀台瓦砚', '青釭剑', '的卢马'],
  ['唐', '开元通宝', '唐三彩骆驼', '簪花仕女图', '兰亭序真迹'],
  ['宋', '交子', '汝窑天青釉洗', '清明上河图', '苏轼寒食帖'],
  ['元', '中统元宝交钞', '青花鬼谷子下山罐', '元青花萧何追韩信梅瓶', '富春山居图'],
  ['明', '大明宝钞', '成化斗彩鸡缸杯', '永乐大典', '万历金翼善冠'],
  ['民国', '袁大头', '中山装', '张大千泼墨山水', '翠玉白菜']
];
export const COPIES = [3, 3, 2, 1];
export const BASE = [0, 10, 20, 30, 40];
export const card = (era, star, copy) => ({ id: `${era}-${star}-${copy}`, era, star, copy, name: ERAS.find(e => e[0] === era)?.[star], base: BASE[star], red: star === 4 });
export function deckFor(eras) {
  return eras.flatMap(era => COPIES.flatMap((n, i) => Array.from({length:n}, (_, k) => card(era, i+1, k+1))));
}
