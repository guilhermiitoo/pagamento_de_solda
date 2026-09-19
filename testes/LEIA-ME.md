# Testes do Sistema de Solda

Rodam contra o próprio `TPV_SolderControl_v11_0.html`, sem servidor e sem internet.

```bash
cd testes
node teste-peso.js          # leitura do peso da planilha do WH e classificação da OP
node teste-rede.js          # duas máquinas gravando no mesmo JSON da pasta de rede
node teste-dados-reais.js   # análise ponta a ponta com o banco real do usuário

npm i playwright            # só para os dois abaixo (abrem um Chrome de verdade)
node teste-navegador.js     # confere que NADA é buscado na internet e mede a abertura
node teste-abas.js          # entra com o banco real e abre todas as abas
```

`teste-rede.js` aceita o caminho de um HTML como argumento. Rodando contra a
versão v11.0 antiga ele falha — é justamente o pedido que sumia entre computadores.
