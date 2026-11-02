export const ERRORS_MESSAGES = {
    EXCEPTIONS: {
        BAD_REQUEST: "Invalid request",
        INTERNAL_ERROR: "Internal error",
        TOO_MANY_REQUESTS: "Too many requests, please try again later",
    },
    AUTH: {
        USER_NOT_FOUND: 'User not found',
        INVALID_OTP: 'Otp code is invalid',
        EXPIRED_OTP: 'Otp code is expired',
        TOKEN_NOT_FOUND: 'Refresh token not found',
        INVALID_TOKEN: 'Refresh token is not valid',
    },
    SETTINGS: {
        SETTINGS_NOT_FOUND: 'Settings not found',
        PRIMARY_CURRENCY_ALREADY_SET: 'Primary currency is already set and cannot be changed',
    },
    ACCOUNTS: {
        ACCOUNT_NOT_FOUND: 'Account not found',
        PRIMARY_ACCOUNT_FUNDING: 'The primary account cannot have a monthly funding, it funds the other accounts',
        MONTHLY_FUNDING_REQUIRED: 'A monthly funding day requires a monthly funding amount',
    },
    CATEGORIES: {
        CATEGORY_NOT_FOUND: 'Category not found',
        CATEGORY_ALREADY_EXISTS: 'A category with this type already exists',
    },
    INCOMES: {
        INCOME_NOT_FOUND: 'Income not found'
    },
    FIXED_CHARGES: {
        FIXED_CHARGE_NOT_FOUND: 'Fixed charge not found'
    },
    TRANSACTIONS: {
        TRANSACTION_NOT_FOUND: 'Transaction not found',
        TRANSFER_NOT_EDITABLE: 'The amount, account, date and category of a transfer cannot be changed, delete it and create a new one',
        TRANSACTION_ALREADY_CONFIRMED: 'Transaction is already confirmed',
    },
    PROVISIONS: {
        PROVISION_NOT_FOUND: 'Provision not found',
        PROVISION_CANCELLED: 'Provision is cancelled and cannot be changed',
        ACCOUNT_REQUIRED: 'An account is required to settle a provision without account',
    },
    INSTALLMENT_PLANS: {
        INSTALLMENT_PLAN_NOT_FOUND: 'Installment plan not found',
        INSTALLMENT_PLAN_CANCELLED: 'Installment plan is cancelled and cannot be changed',
        INSTALLMENT_NOT_FOUND: 'Installment not found',
        INSTALLMENT_ALREADY_PAID: 'Installment is already paid',
        ACCOUNT_REQUIRED: 'An account is required to pay an installment of a plan without account',
    },
    SAVINGS_GOALS: {
        SAVINGS_GOAL_NOT_FOUND: 'Savings goal not found',
        TARGET_AMOUNT_REQUIRED: 'A target date requires a target amount',
        ACCOUNT_REQUIRED: 'An account is required to contribute to a savings goal without account',
    },
    TRANSFERS: {
        SAME_ACCOUNT: 'The source and destination accounts must be different',
    }
}