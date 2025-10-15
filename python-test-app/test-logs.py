#!/usr/bin/env python3
"""
Test script to verify OpenTelemetry logging integration
"""

import os
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

print("🧪 Testing OpenTelemetry logging integration...")

# Test standard Python logging
logger.info("This is a test log message from Python")
logger.warning("This is a warning message")
logger.error("This is an error message")

print("✅ Log messages sent via Python logging")
print("Check if these appear in Loki via Alloy")
