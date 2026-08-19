reprom:
	docker-compose restart prometheus

telegram-agent-push:
	$(MAKE) -C telegram-agent build
