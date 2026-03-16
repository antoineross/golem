package scrape

import (
	"fmt"
	"scraper/internal/core/mapper"
	"scraper/internal/platform/engineapi"
	"scraper/internal/utils/parser"
	"strings"

	"github.com/gofiber/fiber/v2"
)

type Handler struct {
	service *Service
	mapper  *mapper.Service
}

func NewHandler(service *Service, mapper *mapper.Service) *Handler {
	return &Handler{service: service, mapper: mapper}
}

func (h *Handler) HandleGetScrape(c *fiber.Ctx) error {
	var p engineapi.GetV1ScrapeParams
	fmt.Println("Raw query:", string(c.Request().URI().QueryString()))

	if err := parser.ParseQuery(c, &p); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(engineapi.Error{
			Success: &[]bool{false}[0],
			Error:   &[]string{"invalid query"}[0],
		})
	}

	if p.Url == "" {
		return c.Status(fiber.StatusBadRequest).JSON(engineapi.Error{Success: &[]bool{false}[0], Error: &[]string{"url is required"}[0]})
	}

	result, err := h.service.ScrapeURL(c.Context(), p)
	if err != nil {
		errMsg := err.Error()

		// Check if it's a typed ScrapeError
		if scrapeErr, ok := err.(*ScrapeError); ok {
			// Use the status code from the typed error
			return c.Status(scrapeErr.StatusCode).JSON(engineapi.Error{
				Success: &[]bool{false}[0],
				Error:   &errMsg,
			})
		}

		// Fallback: categorize errors by string matching for backward compatibility
		statusCode := fiber.StatusInternalServerError
		if strings.Contains(errMsg, "invalid URL") || strings.Contains(errMsg, "malformed") {
			statusCode = fiber.StatusBadRequest
		} else if strings.Contains(errMsg, "stopped after") && strings.Contains(errMsg, "redirects") {
			statusCode = fiber.StatusBadRequest
		} else if strings.Contains(errMsg, "timeout") || strings.Contains(errMsg, "deadline exceeded") {
			statusCode = fiber.StatusRequestTimeout
		}

		return c.Status(statusCode).JSON(engineapi.Error{
			Success: &[]bool{false}[0],
			Error:   &errMsg,
		})
	}
	return c.JSON(result)
}
