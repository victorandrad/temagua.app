// Recado para quem abre o console do navegador (DevTools): convite para entrar em contato e contribuir.
const GOTA = String.raw`
       ,
      / \
     /   \
    /     \
   |  ^ ^  |
    \  ◡  /
     '---'`;

export function recadoNoConsole(): void {
  const azul = 'color:#276ef1;font-weight:800';
  const texto = 'color:inherit;font-size:13px;line-height:1.5';
  console.log(`%c${GOTA}`, 'color:#276ef1;font-weight:700;line-height:1.1');
  console.log('%cTem Água? 💧', `${azul};font-size:28px;letter-spacing:-.5px`);
  console.log(
    '%cOpa! Fuçando o código? A gente gosta de gente curiosa. 🕵️\n\n' +
      'O Tem Água? é uma iniciativa independente e sem fins lucrativos de moradores de Salto/SP\n' +
      'para transformar cada torneira seca em dado — porque contra dados não há argumentos. 📊\n\n' +
      '%cQuer ajudar, achou um bug ou tem uma ideia?%c\n' +
      '  📸 Instagram: https://instagram.com/salto.temagua\n' +
      '  💻 Código aberto (AGPL-3.0): https://github.com/victorandrad/temagua.app — issues e pull requests são bem-vindos.\n' +
      '     Quer levar para a sua cidade? Pode! Só mantenha o código aberto e os créditos. 😉',
    texto,
    `${azul};font-size:14px`,
    texto,
  );
}
