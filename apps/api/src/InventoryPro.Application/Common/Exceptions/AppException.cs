namespace InventoryPro.Application.Common.Exceptions;

/// <summary>
/// Base exception cho tất cả business exceptions.
/// </summary>
public abstract class AppException : Exception
{
    protected AppException(string message) : base(message) { }
    protected AppException(string message, Exception inner) : base(message, inner) { }
}

public class ValidationException : AppException
{
    public IReadOnlyDictionary<string, string[]> Errors { get; }

    public ValidationException(string message) : base(message)
    {
        Errors = new Dictionary<string, string[]>();
    }

    public ValidationException(IDictionary<string, string[]> errors)
        : base("Validation failed")
    {
        Errors = new Dictionary<string, string[]>(errors);
    }
}

public class NotFoundException : AppException
{
    public NotFoundException(string entity, object key)
        : base($"Không tìm thấy {entity} với id = {key}") { }

    public NotFoundException(string message)
        : base(message) { }
}

public class ForbiddenException : AppException
{
    public ForbiddenException(string message) : base(message) { }
}

public class UnauthorizedException : AppException
{
    public UnauthorizedException(string message) : base(message) { }
}

public class ConflictException : AppException
{
    public ConflictException(string message) : base(message) { }
}

/// <summary>
/// Nghiệp vụ bị vi phạm (vd: tồn kho âm, status không hợp lệ, v.v.)
/// </summary>
public class BusinessRuleException : AppException
{
    public BusinessRuleException(string message) : base(message) { }
}
