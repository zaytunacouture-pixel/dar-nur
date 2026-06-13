#!/usr/bin/env python3
import asyncio
from playwright.async_api import async_playwright

async def generate_pdf():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1920, "height": 1080})

        # Navigate to localhost
        await page.goto("http://localhost:9000", wait_until="networkidle")

        # Wait a bit for rendering
        await page.wait_for_timeout(2000)

        # Generate PDF
        await page.pdf(path="dar-nur-current.pdf", format="A4")

        await browser.close()
        print("PDF generated: dar-nur-current.pdf")

asyncio.run(generate_pdf())
