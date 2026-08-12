.PHONY: up down sh install lint typecheck test test-watch coverage heavy play demo dev build clean logs

COMPOSE := docker compose
EXEC := $(COMPOSE) exec app

## Sobe app + postgres + redis e instala as dependências
up:
	$(COMPOSE) up -d --build
	$(EXEC) pnpm install

down:
	$(COMPOSE) down

## Shell dentro do container de desenvolvimento
sh:
	$(EXEC) bash

install:
	$(EXEC) pnpm install

lint:
	$(EXEC) pnpm lint

typecheck:
	$(EXEC) pnpm typecheck

test:
	$(EXEC) pnpm test

test-watch:
	$(EXEC) pnpm --filter @ilhavera/rules test:watch

coverage:
	$(EXEC) pnpm test:coverage

## Critério de aceite da Fase 1: 10.000 partidas aleatórias
heavy:
	$(EXEC) pnpm test:heavy

## Partida hot-seat no terminal (precisa de TTY)
play:
	$(EXEC) pnpm play

## Autojogo: uma partida completa sem digitar nada
demo:
	$(EXEC) pnpm demo

## Servidor de jogo em modo watch, na porta 3000 do host
dev:
	$(EXEC) pnpm --filter @ilhavera/server dev

build:
	$(EXEC) pnpm build

logs:
	$(COMPOSE) logs -f

clean:
	$(COMPOSE) down -v
