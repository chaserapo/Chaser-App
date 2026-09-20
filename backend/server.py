from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import logging
from pathlib import Path


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "Hello World"}

# Feature routes
from routes.invitations import router as invitations_router  # noqa: E402
from routes.account import router as account_router  # noqa: E402
from routes.weather_cron import weather_cron_loop, _cron_tick  # noqa: E402
from routes.alerts_cron import alerts_cron_loop, _cron_tick as _alerts_cron_tick  # noqa: E402
from routes.weather_alerts_cron import weather_alerts_cron_loop, _cron_tick as _weather_alerts_cron_tick  # noqa: E402
api_router.include_router(invitations_router)
api_router.include_router(account_router)

# On-demand refresh endpoint — safe to call ad-hoc from admin tools or a cron
# runner. Idempotent; each call creates one new forecast run per active
# location.
@api_router.post("/weather/refresh-all")
async def weather_refresh_all():
    try:
        await _cron_tick()
        return {"status": "ok"}
    except Exception as e:  # pragma: no cover
        return {"status": "error", "message": str(e)}

# On-demand alerts sweep — same idempotent-tick shape as weather/refresh-all,
# useful for verifying the push pipeline without waiting for the interval.
@api_router.post("/alerts/check-now")
async def alerts_check_now():
    try:
        await _alerts_cron_tick()
        return {"status": "ok"}
    except Exception as e:  # pragma: no cover
        return {"status": "error", "message": str(e)}

# On-demand weather-alerts sweep — same idempotent-tick shape as
# weather/refresh-all, useful for verifying the alerts push pipeline without
# waiting for the interval.
@api_router.post("/weather-alerts/check-now")
async def weather_alerts_check_now():
    try:
        await _weather_alerts_cron_tick()
        return {"status": "ok"}
    except Exception as e:  # pragma: no cover
        return {"status": "error", "message": str(e)}

# Include the router in the main app
app.include_router(api_router)

# Liveness / readiness probe — must be reachable without the /api prefix so
# an ingress health check doesn't rely on the ingress rewrite.
@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/api/health")
async def api_health():
    return {"status": "ok"}

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def _start_weather_cron():
    # Background weather-forecast fetcher. No-op unless SUPABASE_SERVICE_ROLE_KEY
    # is configured so local dev/preview works without it.
    import asyncio
    asyncio.create_task(weather_cron_loop())

@app.on_event("startup")
async def _start_alerts_cron():
    # Background overdue-maintenance / open-fault push notifier. No-op unless
    # SUPABASE_SERVICE_ROLE_KEY is configured so local dev/preview works without it.
    import asyncio
    asyncio.create_task(alerts_cron_loop())

@app.on_event("startup")
async def _start_weather_alerts_cron():
    # Background weather-alerts push notifier (spray window, frost, wind,
    # rain change, rain-after-spray). No-op unless SUPABASE_SERVICE_ROLE_KEY
    # is configured so local dev/preview works without it.
    import asyncio
    asyncio.create_task(weather_alerts_cron_loop())
