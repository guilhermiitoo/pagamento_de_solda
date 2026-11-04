# Testes do Sistema de Solda

Rodam contra o próprio `TPV_SolderControl_v13_0.html`, sem servidor e sem internet.

```bash
cd testes
node teste-peso.js          # leitura do peso da planilha do WH e classificação da OP
node teste-pasta.js         # 4 PCs gravando juntos na pasta dados/ (trava, token, migração)
node teste-dados-reais.js   # análise ponta a ponta com o banco real do usuário

npm i playwright            # só para os dois abaixo (abrem um Chrome de verdade)
node teste-navegador.js     # confere que NADA é buscado na internet e mede a abertura
node teste-abas.js          # entra com o banco real e abre todas as abas
```

`teste-pasta.js` imita a pasta de rede em memória e põe 4 "PCs" pedindo os mesmos
tubos ao mesmo tempo. Confere: migração do JSON antigo, nenhum tubo reservado duas
vezes, nenhum pedido perdido, edição/exclusão de histórico chegando a todos e os 4 PCs
terminando com o mesmo banco. `LAT=40 node teste-pasta.js` simula uma rede lenta
(até 80 ms por operação de arquivo). Aceita `[banco.json] [html]` como argumentos.
