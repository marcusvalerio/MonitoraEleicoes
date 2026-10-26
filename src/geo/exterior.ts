/**
 * Coordenadas aproximadas (centro urbano, graus decimais) das cidades onde o TSE instala seções no exterior.
 * Chave = nome normalizado como o TSE publica (NM_MUNICIPIO de UF "ZZ", sem acento, maiúsculas).
 * Cidade fora desta tabela NÃO ganha posição inventada: aparece só na lista, sem ponto no mapa.
 */
const CITIES: [string, number, number][] = [
  ["LISBOA", 38.72, -9.14], ["PORTO", 41.15, -8.61], ["FARO", 37.02, -7.93], ["MADRI", 40.42, -3.7], ["BARCELONA", 41.39, 2.17],
  ["PARIS", 48.86, 2.35], ["LYON", 45.76, 4.84], ["MARSELHA", 43.3, 5.37], ["LONDRES", 51.51, -0.13], ["DUBLIN", 53.35, -6.26],
  ["ROMA", 41.9, 12.5], ["MILAO", 45.46, 9.19], ["GENEBRA", 46.2, 6.14], ["ZURIQUE", 47.38, 8.54], ["BERNA", 46.95, 7.45],
  ["BERLIM", 52.52, 13.4], ["MUNIQUE", 48.14, 11.58], ["FRANKFURT", 50.11, 8.68], ["HAMBURGO", 53.55, 9.99], ["COLONIA", 50.94, 6.96],
  ["BRUXELAS", 50.85, 4.35], ["AMSTERDA", 52.37, 4.9], ["ROTERDA", 51.92, 4.48], ["HAIA", 52.08, 4.3], ["VIENA", 48.21, 16.37],
  ["ESTOCOLMO", 59.33, 18.07], ["OSLO", 59.91, 10.75], ["COPENHAGUE", 55.68, 12.57], ["HELSINQUE", 60.17, 24.94], ["VARSOVIA", 52.23, 21.01],
  ["ATENAS", 37.98, 23.73], ["MOSCOU", 55.76, 37.62], ["BUDAPESTE", 47.5, 19.04], ["PRAGA", 50.08, 14.44], ["LUXEMBURGO", 49.61, 6.13],
  ["NOVA YORK", 40.71, -74.01], ["BOSTON", 42.36, -71.06], ["MIAMI", 25.76, -80.19], ["ORLANDO", 28.54, -81.38], ["WASHINGTON", 38.91, -77.04],
  ["ATLANTA", 33.75, -84.39], ["CHICAGO", 41.88, -87.63], ["HOUSTON", 29.76, -95.37], ["LOS ANGELES", 34.05, -118.24], ["SAO FRANCISCO", 37.77, -122.42],
  ["HARTFORD", 41.76, -72.67], ["TORONTO", 43.65, -79.38], ["MONTREAL", 45.5, -73.57], ["VANCOUVER", 49.28, -123.12], ["OTTAWA", 45.42, -75.7],
  ["CIDADE DO MEXICO", 19.43, -99.13], ["HAVANA", 23.11, -82.37], ["PANAMA", 8.98, -79.52], ["BOGOTA", 4.71, -74.07], ["CARACAS", 10.48, -66.9],
  ["LIMA", -12.05, -77.04], ["QUITO", -0.18, -78.47], ["LA PAZ", -16.5, -68.15], ["SANTA CRUZ DE LA SIERRA", -17.78, -63.18], ["SANTIAGO", -33.45, -70.67],
  ["BUENOS AIRES", -34.6, -58.38], ["CORDOBA", -31.42, -64.18], ["MONTEVIDEU", -34.9, -56.16], ["ASSUNCAO", -25.26, -57.58], ["CIUDAD DEL ESTE", -25.51, -54.61],
  ["ENCARNACION", -27.33, -55.87], ["PEDRO JUAN CABALLERO", -22.55, -55.73], ["CAIENA", 4.92, -52.31], ["PARAMARIBO", 5.85, -55.2], ["GEORGETOWN", 6.8, -58.16],
  ["LUANDA", -8.84, 13.23], ["MAPUTO", -25.97, 32.57], ["JOANESBURGO", -26.2, 28.05], ["CIDADE DO CABO", -33.92, 18.42], ["PRAIA", 14.93, -23.51],
  ["LAGOS", 6.52, 3.38], ["ACRA", 5.6, -0.19], ["CAIRO", 30.04, 31.24], ["RABAT", 34.02, -6.84], ["TEL AVIV", 32.08, 34.78],
  ["DUBAI", 25.2, 55.27], ["DOHA", 25.29, 51.53], ["BEIRUTE", 33.89, 35.5], ["TOQUIO", 35.68, 139.69], ["NAGOIA", 35.18, 136.91],
  ["HAMAMATSU", 34.71, 137.73], ["PEQUIM", 39.9, 116.41], ["XANGAI", 31.23, 121.47], ["HONG KONG", 22.32, 114.17], ["SEUL", 37.57, 126.98],
  ["SINGAPURA", 1.35, 103.82], ["NOVA DELHI", 28.61, 77.21], ["SYDNEY", -33.87, 151.21], ["MELBOURNE", -37.81, 144.96], ["BRISBANE", -27.47, 153.03],
  ["PERTH", -31.95, 115.86], ["AUCKLAND", -36.85, 174.76], ["WELLINGTON", -41.29, 174.78],
  ["ABIDJA", 5.36, -4.01], ["ABU DHABI", 24.45, 54.38], ["ACCRA", 5.6, -0.19], ["AMA", 31.95, 35.93], ["ANCARA", 39.93, 32.86],
  ["ARGEL", 36.75, 3.06], ["ARTIGAS", -30.4, -56.47], ["BANGKOK", 13.76, 100.5], ["BAREIN", 26.23, 50.59], ["BELGRADO", 44.79, 20.45],
  ["BISSAU", 11.86, -15.6], ["BRATISLAVA", 48.15, 17.11], ["BUCARESTE", 44.43, 26.1], ["CAMBERRA", -35.28, 149.13], ["CANTAO", 23.13, 113.26],
  ["COCHABAMBA", -17.39, -66.16], ["CONCEPCION", -23.41, -57.43], ["DACAR", 14.72, -17.47], ["DAMASCO", 33.51, 36.28], ["DAR ES SALAAM", -6.79, 39.21],
  ["DILI", -8.56, 125.57], ["EDIMBURGO", 55.95, -3.19], ["GUATEMALA", 14.63, -90.51], ["HANOI", 21.03, 105.85], ["ISTAMBUL", 41.01, 28.98],
  ["JACARTA", -6.21, 106.85], ["KATMANDU", 27.72, 85.32], ["KIEV", 50.45, 30.52], ["KINGSTON-JAMAICA", 18.02, -76.8], ["KUAITE", 29.38, 47.99],
  ["KUALA LUMPUR", 3.14, 101.69], ["LIUBLIANA", 46.06, 14.51], ["MANILA", 14.6, 120.98], ["MANAGUA", 12.11, -86.24], ["MASCATE", 23.59, 58.41],
  ["MENDOZA", -32.89, -68.83], ["MEXICO", 19.43, -99.13], ["MUMBAI", 19.08, 72.88], ["NAIROBI", -1.29, 36.82], ["NASSAU", 25.04, -77.35],
  ["NICOSIA", 35.19, 33.38], ["PASO LOS LIBRES", -29.71, -57.09], ["PORT OF SPAIN", 10.66, -61.51], ["PORTO PRINCIPE", 18.59, -72.31], ["PRETORIA", -25.75, 28.19],
  ["PUERTO IGUAZU", -25.6, -54.57], ["RAMALLAH", 31.9, 35.2], ["RIADE", 24.71, 46.68], ["RIO BRANCO", -32.6, -53.38], ["SALTO DEL GUAIRA", -24.06, -54.31],
  ["SAO DOMINGOS", 18.49, -69.93], ["SAO JOSE", 9.93, -84.08], ["SAO SALVADOR", 13.69, -89.22], ["SOFIA", 42.7, 23.32], ["TAIPE", 25.03, 121.57],
  ["TALIN", 59.44, 24.75], ["TEERA", 35.69, 51.39], ["TEGUCIGALPA", 14.07, -87.19], ["TRIPOLI", 32.89, 13.19], ["TUNIS", 36.81, 10.18],
  ["WINDHOEK", -22.56, 17.08], ["ZAGREB", 45.81, 15.98],
];

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().trim();
const BY_NAME = new Map(CITIES.map(([n, lat, lon]) => [n, { lat, lon }]));

export function exteriorCoords(name: string): { lat: number; lon: number } | null {
  return BY_NAME.get(norm(name)) ?? null;
}

/** Projeção equiretangular simples para o mini-mapa-múndi (viewBox 360 × 180). */
export const project = (lat: number, lon: number) => ({ x: lon + 180, y: 90 - lat });
