"""Initial credentials for automatic biometric and roster provisioning."""


def initial_employee_password(employee_code: str) -> str:
    """Match the password HR distributes; preserve leading zeroes in the suffix.

    Only use when creating an account. Syncing an existing employee must never
    reset their password, including after they have chosen a personal password.
    """
    code = employee_code.strip()
    if not code:
        raise ValueError("Employee code is required")
    return f"Jade@{code[-3:]}"
