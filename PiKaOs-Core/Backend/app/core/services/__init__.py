"""Business logic layer: what the app *does*, independent of HTTP.

Services orchestrate repositories + security + redis. Routers stay thin and only
translate between HTTP and these functions.
"""
