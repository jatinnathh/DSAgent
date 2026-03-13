import pandas as pd
import io
from typing import BinaryIO
from .schema import DatasetMetadata, ColumnInfo
import uuid

def extract_metadata(file_content: bytes, filename: str) -> DatasetMetadata:
    """
    Extract comprehensive metadata from uploaded CSV file
    
    Args:
        file_content: Raw bytes of the CSV file
        filename: Original filename
        
    Returns:
        DatasetMetadata object with complete analysis
    """
    
    # Read CSV into pandas
    df = pd.read_csv(io.BytesIO(file_content))
    
    # Generate session ID
    session_id = str(uuid.uuid4())
    
    # Basic counts
    row_count = len(df)
    column_count = len(df.columns)
    
    # Memory usage
    memory_usage_mb = df.memory_usage(deep=True).sum() / (1024 * 1024)
    
    # Analyze each column
    columns_info = []
    numeric_columns = []
    categorical_columns = []
    datetime_columns = []
    
    for col in df.columns:
        dtype_str = str(df[col].dtype)
        null_count = int(df[col].isna().sum())
        null_percentage = (null_count / row_count * 100) if row_count > 0 else 0
        unique_count = int(df[col].nunique())
        
        # Get sample values (non-null, up to 5)
        sample_values = df[col].dropna().head(5).tolist()
        
        # Convert numpy types to Python native types for JSON serialization
        sample_values = [
            float(v) if pd.api.types.is_float(v) else
            int(v) if pd.api.types.is_integer(v) else
            str(v)
            for v in sample_values
        ]
        
        columns_info.append(ColumnInfo(
            name=col,
            dtype=dtype_str,
            null_count=null_count,
            null_percentage=round(null_percentage, 2),
            unique_count=unique_count,
            sample_values=sample_values
        ))
        
        # Categorize column types
        if pd.api.types.is_numeric_dtype(df[col]):
            numeric_columns.append(col)
        elif pd.api.types.is_datetime64_any_dtype(df[col]):
            datetime_columns.append(col)
        else:
            # Heuristic: if unique values < 50 or < 5% of rows, treat as categorical
            if unique_count < 50 or (unique_count / row_count < 0.05):
                categorical_columns.append(col)
    
    # Get first 5 rows as sample
    sample_rows = df.head(5).to_dict(orient='records')
    
    # Convert numpy types in sample rows
    for row in sample_rows:
        for key, value in row.items():
            if pd.isna(value):
                row[key] = None
            elif pd.api.types.is_float(value):
                row[key] = float(value)
            elif pd.api.types.is_integer(value):
                row[key] = int(value)
            else:
                row[key] = str(value)
    
    return DatasetMetadata(
        session_id=session_id,
        filename=filename,
        row_count=row_count,
        column_count=column_count,
        columns=columns_info,
        numeric_columns=numeric_columns,
        categorical_columns=categorical_columns,
        datetime_columns=datetime_columns,
        memory_usage_mb=round(memory_usage_mb, 2),
        sample_rows=sample_rows
    )


def metadata_to_llm_prompt(metadata: DatasetMetadata) -> str:
    """
    Convert metadata into a concise text description for the LLM
    
    Returns:
        Formatted string describing the dataset
    """
    
    prompt = f"""# Dataset: {metadata.filename}

## Overview
- Rows: {metadata.row_count:,}
- Columns: {metadata.column_count}
- Memory: {metadata.memory_usage_mb:.2f} MB

## Column Summary
"""
    
    for col in metadata.columns:
        prompt += f"\n### {col.name} ({col.dtype})"
        prompt += f"\n- Null values: {col.null_count} ({col.null_percentage:.1f}%)"
        prompt += f"\n- Unique values: {col.unique_count}"
        prompt += f"\n- Sample: {col.sample_values[:3]}"
    
    prompt += f"\n\n## Column Types\n"
    prompt += f"- Numeric: {', '.join(metadata.numeric_columns) if metadata.numeric_columns else 'None'}\n"
    prompt += f"- Categorical: {', '.join(metadata.categorical_columns) if metadata.categorical_columns else 'None'}\n"
    prompt += f"- Datetime: {', '.join(metadata.datetime_columns) if metadata.datetime_columns else 'None'}\n"
    
    prompt += f"\n## Sample Rows (first 3)\n"
    for i, row in enumerate(metadata.sample_rows[:3], 1):
        prompt += f"\nRow {i}: {row}"
    
    return prompt