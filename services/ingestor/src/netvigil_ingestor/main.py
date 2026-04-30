"""Ingestor entrypoint — starts Syslog and NetFlow collectors concurrently."""
from __future__ import annotations

import asyncio
import logging

from netvigil_ingestor import kafka_producer as kp
from netvigil_ingestor.collectors import netflow, syslog
from netvigil_ingestor.config import settings

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)


async def main() -> None:
    await kp.start()
    log.info("Kafka producer ready")
    try:
        await asyncio.gather(
            syslog.serve(settings.syslog_host, settings.syslog_port),
            netflow.serve(settings.netflow_host, settings.netflow_port),
        )
    finally:
        await kp.stop()


if __name__ == "__main__":
    asyncio.run(main())
