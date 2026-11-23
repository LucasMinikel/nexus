/**
 * Cidades com mapa real embutido: as 27 capitais. Centro = marco central aproximado.
 * Cada mapa é um quadrado de KM × KM em volta do centro.
 */
export const KM = 10;

export const CITIES = [
  ['rio-branco', 'Rio Branco', 'AC', -9.9747, -67.81],
  ['maceio', 'Maceió', 'AL', -9.6658, -35.7353],
  ['macapa', 'Macapá', 'AP', 0.0349, -51.0694],
  ['manaus', 'Manaus', 'AM', -3.119, -60.0217],
  ['salvador', 'Salvador', 'BA', -12.9714, -38.5014],
  ['fortaleza', 'Fortaleza', 'CE', -3.7319, -38.5267],
  ['brasilia', 'Brasília', 'DF', -15.7939, -47.8828],
  ['vitoria', 'Vitória', 'ES', -20.3155, -40.3128],
  ['goiania', 'Goiânia', 'GO', -16.6869, -49.2648],
  ['sao-luis', 'São Luís', 'MA', -2.5307, -44.3068],
  ['cuiaba', 'Cuiabá', 'MT', -15.6014, -56.0979],
  ['campo-grande', 'Campo Grande', 'MS', -20.4697, -54.6201],
  ['belo-horizonte', 'Belo Horizonte', 'MG', -19.9167, -43.9345],
  ['belem', 'Belém', 'PA', -1.4558, -48.4902],
  ['joao-pessoa', 'João Pessoa', 'PB', -7.1195, -34.845],
  ['curitiba', 'Curitiba', 'PR', -25.4284, -49.2733],
  ['recife', 'Recife', 'PE', -8.0476, -34.877],
  ['teresina', 'Teresina', 'PI', -5.092, -42.8038],
  ['rio-de-janeiro', 'Rio de Janeiro', 'RJ', -22.9068, -43.1729],
  ['natal', 'Natal', 'RN', -5.7945, -35.211],
  ['porto-alegre', 'Porto Alegre', 'RS', -30.0346, -51.2177],
  ['porto-velho', 'Porto Velho', 'RO', -8.7612, -63.9004],
  ['boa-vista', 'Boa Vista', 'RR', 2.8235, -60.6758],
  ['florianopolis', 'Florianópolis', 'SC', -27.5954, -48.548],
  ['sao-paulo', 'São Paulo', 'SP', -23.5505, -46.6333],
  ['aracaju', 'Aracaju', 'SE', -10.9472, -37.0731],
  ['palmas', 'Palmas', 'TO', -10.184, -48.3336],
].map(([id, name, uf, lat, lon]) => ({ id, name, uf, lat, lon }));

/** Caixa (sul, oeste, norte, leste) de KM × KM em volta do centro. */
export function bbox({ lat, lon }, km = KM) {
  const dLat = km / 2 / 110.574;
  const dLon = km / 2 / (111.32 * Math.cos((lat * Math.PI) / 180));
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon];
}
