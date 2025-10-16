FROM python:3.12

WORKDIR /code

# Install Poetry
RUN curl -sSL https://install.python-poetry.org | python3 -

# Add Poetry to PATH
ENV PATH="/root/.local/bin:${PATH}"

# Copy the entire project
COPY . .

# Install dependencies (runtime only)
RUN poetry install --without dev

# Expose the port that the application will run on
EXPOSE 8000