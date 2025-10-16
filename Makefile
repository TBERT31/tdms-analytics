.PHONY: help install dev build test lint clean infra

help: ## Afficher l'aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Installer toutes les dépendances
	npm install
	cd apps/dataset-service && poetry install

infra: ## Démarrer l'infrastructure (Redis, ClickHouse, Keycloak)
	docker-compose up -d redis clickhouse keycloak

dev: infra ## Lancer tous les services en mode dev
	nx run-many -t dev --all --parallel

dev-frontend: ## Lancer seulement le frontend
	nx dev frontend

dev-gateway: ## Lancer seulement l'API Gateway
	nx dev api-gateway

dev-dataset: infra ## Lancer seulement le service dataset
	nx dev dataset-service

build: ## Builder tous les projets
	nx run-many -t build --all

test: ## Tester tous les projets
	nx run-many -t test --all

test-affected: ## Tester seulement ce qui a changé
	nx affected -t test

lint: ## Linter tous les projets
	nx run-many -t lint --all

lint-affected: ## Linter seulement ce qui a changé
	nx affected -t lint

graph: ## Afficher le graph de dépendances
	nx graph

clean: ## Nettoyer les caches et artifacts
	nx reset
	rm -rf dist .next coverage
	docker-compose down -v

reset: clean ## Reset complet (clean + reinstall)
	rm -rf node_modules apps/*/node_modules
	npm install