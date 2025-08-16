## Идеальная структура

ml-service/
├── app/                              # код приложения
│   ├── api/                          # HTTP-слой (роуты, схемы запрос/ответ)
│   │   ├── __init__.py
│   │   ├── routes.py                 # /health, /predict, /indicators, /train, /stats
│   │   └── schemas.py                # pydantic-модели (с FastAPI) или dataclasses
│   ├── core/                         # базовые вещи: конфиг, логирование, utils
│   │   ├── config.py                 # Settings (env): paths, registry URI, thresholds
│   │   ├── logging.py                # JSON-логирование, кореляция запросов
│   │   └── timing.py                 # декораторы метрик/таймингов
│   ├── models/                       # реализации моделей и общий интерфейс
│   │   ├── __init__.py
│   │   ├── base.py                   # IModel: load(), predict(), train(), save()
│   │   ├── btcusdt_mlp.py            # твоя BTCUSDTMLModel (логика признаков + MLP)
│   │   ├── registry.py               # реестр/фабрика моделей + версия/теги
│   │   └── features.py               # расчёт индикаторов, трансформеры, скейлеры
│   ├── services/                     # бизнес-логика поверх моделей
│   │   ├── inference_service.py      # батч/онлайн-инференс, постпроцессинг сигналов
│   │   └── training_service.py       # обучение, валидация, запись метрик
│   ├── storage/                      # абстракции хранения
│   │   ├── artifacts.py              # save/load артефактов (модель, скейлер)
│   │   ├── datasets.py               # загрузка датасетов (S3/DB/файлы)
│   │   └── registry_client.py        # MLflow/MinIO/локальный реестр
│   ├── monitoring/                   # метрики, алерты, прометей/опентелеетр
│   │   └── metrics.py
│   ├── app.py                        # точка входа WSGI/ASGI (минимум кода)
│   └── wsgi.py                       # для gunicorn/uwsgi
├── pipelines/                        # скрипты/пайплайны офлайн обучения
│   ├── train_btcusdt.py              # train + eval + регистрация модели/метрик
│   └── backtest_btcusdt.py           # бэктест на OHLCV
├── artifacts/                        # локальные артефакты (dev): модели, скейлеры
│   └── btcusdt/
│       └── v1/
│           ├── model.pkl
│           ├── scaler.pkl
│           └── model_meta.json
├── tests/
│   ├── unit/
│   │   ├── test_features.py
│   │   ├── test_models.py
│   │   └── test_services.py
│   └── integration/
│       ├── test_api_predict.py
│       └── test_training_pipeline.py
├── scripts/
│   ├── run_server.sh                 # gunicorn -w 2 -b 0.0.0.0:5000 app.wsgi:app
│   └── export_model.sh               # упаковка и версионирование
├── Dockerfile                        # multi-stage build
├── pyproject.toml / setup.cfg        # упаковка, зависимости
├── requirements.txt                  # (если не pyproject)
├── .env.example                      # образец переменных окружения
├── Makefile                          # make test/lint/run/train
└── README.md